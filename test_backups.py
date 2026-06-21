"""Board backup/snapshot behavior — the recovery net for accidental destructive
edits (the bug that nearly lost a company). Exercises board_guard against a temp
data dir; no server boot. Run:  python3 -m unittest -v test_backups
"""
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

# kiros_web reads KIROS_DATA at import (it builds DATA/USERS_DIR and a Store), so
# point it at a throwaway dir BEFORE importing the module.
_TMP = tempfile.mkdtemp(prefix="kiros-bak-")
os.environ["KIROS_DATA"] = _TMP

import kiros_web as web  # noqa: E402


class BoardBackups(unittest.TestCase):
    def setUp(self):
        self.uid = "u-backup-test"
        udir = web.user_dir(self.uid)                       # isolate: fresh dir per test
        if udir.exists():
            shutil.rmtree(udir)
        self.board = web.ensure_user_data(self.uid)        # writes users/<uid>/KIROS.md
        self.bdir = self.board.parent / "backups"

    def _guarded_write(self, text: str) -> None:
        with web.board_guard(self.uid):
            self.board.write_text(text, encoding="utf-8")

    def test_snapshot_holds_pre_write_state(self):
        self.board.write_text("v1\n", encoding="utf-8")
        self._guarded_write("v2\n")                         # guard snapshots v1, then writes v2
        snaps = sorted(self.bdir.glob("KIROS.md.*.bak"))
        self.assertEqual(len(snaps), 1)
        self.assertEqual(snaps[0].read_text(encoding="utf-8"), "v1\n")
        self.assertEqual(self.board.read_text(encoding="utf-8"), "v2\n")

    def test_legacy_single_slot_still_refreshed(self):
        self.board.write_text("v1\n", encoding="utf-8")
        self._guarded_write("v2\n")
        legacy = self.board.parent / "KIROS.md.bak"
        self.assertTrue(legacy.exists())
        self.assertEqual(legacy.read_text(encoding="utf-8"), "v1\n")

    def test_history_survives_a_later_write(self):
        # The whole point: the snapshot with the good data must NOT be clobbered
        # by the next write (the single-.bak failure mode).
        self.board.write_text("has-company\n", encoding="utf-8")
        self._guarded_write("deleted\n")                    # snapshot #1 = "has-company"
        self._guarded_write("more-edits\n")                 # snapshot #2 = "deleted"
        contents = {p.read_text(encoding="utf-8") for p in self.bdir.glob("KIROS.md.*.bak")}
        self.assertIn("has-company\n", contents)            # still recoverable

    def test_pruned_to_keep_limit(self):
        keep = web.BOARD_BACKUPS_KEEP
        for i in range(keep + 10):
            self._guarded_write(f"rev{i}\n")
            time.sleep(0.002)                               # distinct microsecond timestamps
        snaps = list(self.bdir.glob("KIROS.md.*.bak"))
        self.assertEqual(len(snaps), keep)                  # capped, oldest pruned
        newest = max(snaps)                                 # chronological names → newest
        self.assertEqual(newest.read_text(encoding="utf-8"), f"rev{keep + 10 - 2}\n")


if __name__ == "__main__":
    unittest.main()
