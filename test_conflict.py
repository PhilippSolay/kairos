"""Concurrent / stale-write integrity: an edit, move, or complete that targets a
task line which is no longer present (edited/moved/completed in another tab, or a
double-fire) must NOT add a fresh line — that would DUPLICATE the task. Regression
guard for the launch-audit data-integrity fix. No server boot; calls the handler
methods directly against a temp data dir.  Run:  python3 -m unittest -v test_conflict
"""
import os
import shutil
import tempfile
import unittest

_TMP = tempfile.mkdtemp(prefix="kiros-conflict-")
os.environ["KIROS_DATA"] = _TMP

import kiros_web as web  # noqa: E402
import kiros  # noqa: E402


class _Handler(web.Handler):
    """Handler with the HTTP plumbing stubbed so the mutation methods can be
    exercised in isolation. _json captures the (status, payload) it would send."""
    def __init__(self):
        self.captured = None

    def _json(self, payload, status=200, cookies=None):
        self.captured = (status, payload)


class StaleWriteIntegrity(unittest.TestCase):
    def setUp(self):
        self.uid = "u-conflict-test"
        udir = web.user_dir(self.uid)
        if udir.exists():
            shutil.rmtree(udir)
        web.ensure_user_data(self.uid)
        self.bp = str(web.board_file(self.uid))
        self.h = _Handler()

    def _save(self, fields, lane="active", original=None, moved=False):
        body = {"fields": fields, "lane": lane}
        if original is not None:
            body["originalRaw"] = original
        if moved:
            body["moved"] = True
        self.h._task_save(self.uid, self.bp, body)
        return self.h.captured

    def _board(self):
        from pathlib import Path
        return kiros.parse_board(Path(self.bp).read_text(encoding="utf-8"))

    def _count(self, title):
        return sum(1 for l in kiros.LANES for t in self._board().sections.get(l, []) if t.title == title)

    def _make(self, title, lane="active"):
        st, resp = self._save({"title": title, "front": "PR-HOME", "importance": 3,
                               "urgency": 3, "est": "1h", "added": "2026-06-20"}, lane=lane)
        self.assertTrue(resp.get("ok"), resp)
        return resp["raw"]

    # --- the regression cases ---
    def test_stale_in_place_edit_does_not_duplicate(self):
        raw = self._make("T")
        # someone else edits T in place (the file line changes)
        self._save({"title": "T", "front": "PR-HOME", "importance": 5, "urgency": 3,
                    "est": "1h", "added": "2026-06-20"}, original=raw)
        # now a second tab edits using the STALE original
        st, resp = self._save({"title": "T", "front": "PR-HOME", "importance": 1, "urgency": 3,
                               "est": "1h", "added": "2026-06-20"}, original=raw)
        self.assertEqual(st, 409)
        self.assertFalse(resp.get("ok"))
        self.assertEqual(self._count("T"), 1, "stale in-place edit duplicated the task")

    def test_stale_move_does_not_duplicate(self):
        raw = self._make("M")
        # T gets completed elsewhere (line removed from active)
        self.h._complete(self.uid, self.bp, {"raw": raw, "done": True})
        # second tab tries to MOVE it to parking with the stale (open) raw
        st, resp = self._save({"title": "M", "front": "PR-HOME", "importance": 3, "urgency": 3,
                               "est": "1h", "added": "2026-06-20"}, lane="parking", original=raw, moved=True)
        self.assertEqual(st, 409)
        self.assertEqual(self._count("M"), 1, "stale move resurrected/duplicated the task")

    def test_double_complete_does_not_clone(self):
        raw = self._make("C")
        self.h._complete(self.uid, self.bp, {"raw": raw, "done": True})
        st1, r1 = self.h.captured
        # double-fire / second tab completes the same (now stale) raw
        self.h._complete(self.uid, self.bp, {"raw": raw, "done": True})
        st2, r2 = self.h.captured
        self.assertTrue(r1.get("ok"))
        self.assertFalse(r2.get("ok"), "second complete should be a stale no-op")
        self.assertEqual(self._count("C"), 1, "double-complete cloned the task")
        done = [t for l in ("done",) for t in self._board().sections.get(l, [])]
        self.assertEqual(sum(1 for t in done if t.title == "C"), 1)

    # --- the normal flows must still work (no regression) ---
    def test_create_still_works(self):
        self._make("New")
        self.assertEqual(self._count("New"), 1)

    def test_in_place_edit_still_works(self):
        raw = self._make("E")
        st, resp = self._save({"title": "E", "front": "PR-HOME", "importance": 5, "urgency": 3,
                               "est": "1h", "added": "2026-06-20"}, original=raw)
        self.assertTrue(resp.get("ok"))
        self.assertEqual(self._count("E"), 1)
        edited = [t for l in kiros.LANES for t in self._board().sections.get(l, []) if t.title == "E"][0]
        self.assertEqual(edited.importance, 5)

    def test_move_still_works(self):
        raw = self._make("Mv")
        st, resp = self._save({"title": "Mv", "front": "PR-HOME", "importance": 3, "urgency": 3,
                               "est": "1h", "added": "2026-06-20"}, lane="parking", original=raw, moved=True)
        self.assertTrue(resp.get("ok"))
        self.assertEqual(self._count("Mv"), 1)
        b = self._board()
        self.assertTrue(any(t.title == "Mv" for t in b.sections.get("parking", [])))
        self.assertFalse(any(t.title == "Mv" for t in b.sections.get("active", [])))

    # --- description persistence for URL-less (manually-created) tasks ---
    def test_urlless_task_description_persists(self):
        self.h._task_save(self.uid, self.bp, {"fields": {"title": "Notes", "front": "PR-HOME",
            "est": "1h", "added": "2026-06-20", "description": "keep these notes"}, "lane": "active"})
        st, resp = self.h.captured
        self.assertTrue(resp.get("ok"))
        self.assertTrue(str(resp.get("url", "")).startswith("kiros:local:"), resp)  # stable local key assigned
        descs = web.load_descriptions(web.desc_file(self.uid))
        self.assertEqual(descs.get(resp["url"]), "keep these notes")  # notes actually persisted

    def test_urlless_description_key_stable_across_edits(self):
        self.h._task_save(self.uid, self.bp, {"fields": {"title": "N", "front": "PR-HOME",
            "est": "1h", "added": "2026-06-20", "description": "n1"}, "lane": "active"})
        _, r1 = self.h.captured
        key1, raw1 = r1["url"], r1["raw"]
        # edit in place, echoing the returned url back (as the client now does)
        self.h._task_save(self.uid, self.bp, {"fields": {"title": "N2", "front": "PR-HOME",
            "est": "1h", "added": "2026-06-20", "url": key1, "description": "n2"}, "lane": "active",
            "originalRaw": raw1})
        _, r2 = self.h.captured
        self.assertEqual(r2["url"], key1, "local key must stay stable across edits")
        descs = web.load_descriptions(web.desc_file(self.uid))
        # Exclude the seeded "Start here" explainer key — we care that THIS task's
        # edit didn't leave an orphaned key behind, not about the starter content.
        local = [k for k in descs if k.startswith("kiros:local:") and k != "kiros:local:welcome"]
        self.assertEqual(len(local), 1, "no orphan description keys accumulate")
        self.assertEqual(descs[key1], "n2")

    def test_real_url_task_keeps_its_url(self):
        self.h._task_save(self.uid, self.bp, {"fields": {"title": "Imported", "front": "PR-HOME",
            "est": "1h", "added": "2026-06-20", "url": "https://example.com/x", "description": "d"}, "lane": "active"})
        _, r = self.h.captured
        self.assertEqual(r["url"], "https://example.com/x")  # a real URL is never reassigned


if __name__ == "__main__":
    unittest.main()
