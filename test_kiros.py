"""Tests for the Kiros scoring engine — the one place correctness matters,
and the safety net for when you tune the weights.  Run:  python3 -m unittest -v
"""
import tempfile
import unittest
from datetime import date
from pathlib import Path

import kiros
from kiros import (DEFAULT_WEIGHTS, Board, Front, Task, add_capture, add_company,
                   add_front, add_task_line, avoidance_boost, deadline_pressure,
                   energy_match, fill_day_plan, focusable, format_task_line, parse_board,
                   parse_task, rank, remove_front, remove_line, reorder_section, score_task,
                   toggle_task_done, update_front, rename_company, remove_company)

TODAY = date(2026, 6, 6)
W = dict(DEFAULT_WEIGHTS)


def task(**kw) -> Task:
    return Task(**{"title": "t", **kw})


class DeadlinePressure(unittest.TestCase):
    def test_no_due_date_is_zero(self):
        self.assertEqual(deadline_pressure(task(), TODAY, W), 0.0)

    def test_due_today_is_max(self):
        self.assertEqual(deadline_pressure(task(due=TODAY), TODAY, W), W["deadline_max"])

    def test_overdue_screams_above_max(self):
        overdue = deadline_pressure(task(due=date(2026, 6, 1)), TODAY, W)
        self.assertGreater(overdue, W["deadline_max"])

    def test_far_future_decays_to_zero(self):
        self.assertEqual(deadline_pressure(task(due=date(2026, 7, 30)), TODAY, W), 0.0)

    def test_nearer_due_is_more_pressure(self):
        soon = deadline_pressure(task(due=date(2026, 6, 8)), TODAY, W)
        later = deadline_pressure(task(due=date(2026, 6, 14)), TODAY, W)
        self.assertGreater(soon, later)


class AvoidanceBoost(unittest.TestCase):
    def test_fresh_task_no_boost(self):
        self.assertEqual(avoidance_boost(task(added=TODAY), TODAY, W), 0.0)

    def test_stale_task_is_boosted(self):
        self.assertGreater(avoidance_boost(task(added=date(2026, 5, 1)), TODAY, W), 0.0)

    def test_boost_is_capped(self):
        ancient = avoidance_boost(task(added=date(2020, 1, 1)), TODAY, W)
        self.assertLessEqual(ancient, W["stale_cap"])

    def test_explicit_avoid_flag_adds_boost(self):
        self.assertEqual(avoidance_boost(task(avoid=True), TODAY, W), W["avoid_flag_boost"])

    def test_with_avoidance_false_zeroes_boost_and_lowers_score(self):
        stale = task(added=date(2026, 5, 1), importance=3)        # well past the stale grace
        boosted = score_task(stale, None, W, TODAY)
        exempt = score_task(stale, None, W, TODAY, with_avoidance=False)
        self.assertGreater(boosted.avoidance, 0.0)
        self.assertEqual(exempt.avoidance, 0.0)                   # how Parked tasks are scored
        self.assertLess(exempt.value, boosted.value)             # no aging boost -> lower score


class EnergyMatch(unittest.TestCase):
    def test_no_target_is_neutral(self):
        self.assertEqual(energy_match(task(energy="high"), None, W), 1.0)

    def test_match_gets_bonus(self):
        self.assertEqual(energy_match(task(energy="low"), "low", W), W["energy_bonus"])

    def test_mismatch_gets_penalty(self):
        self.assertEqual(energy_match(task(energy="high"), "low", W), W["energy_penalty"])


class ScoreTask(unittest.TestCase):
    def test_importance_is_double_weighted(self):
        # imp 5, est M(2), no due, fresh, no energy target -> (5*2)/2 = 5.0
        score = score_task(task(importance=5, est="M"), None, W, TODAY)
        self.assertAlmostEqual(score.value, 5.0)

    def test_task_importance_overrides_front(self):
        front = Front(code="X", name="x", importance=1)
        score = score_task(task(importance=5, est="M"), front, W, TODAY)
        self.assertAlmostEqual(score.value, 5.0)

    def test_inherits_front_importance_when_unset(self):
        front = Front(code="X", name="x", importance=5)
        score = score_task(task(est="M"), front, W, TODAY)
        self.assertAlmostEqual(score.value, 5.0)

    def test_smaller_effort_surfaces_quick_wins(self):
        small = score_task(task(importance=3, est="S"), None, W, TODAY)
        large = score_task(task(importance=3, est="L"), None, W, TODAY)
        self.assertGreater(small.value, large.value)

    def test_avoided_important_beats_appealing_easy(self):
        # The research's worked example: the dreaded-but-important task must win.
        dreaded = score_task(task(importance=5, est="M", added=date(2026, 4, 1), avoid=True),
                             None, W, TODAY)
        appealing = score_task(task(importance=2, est="M", added=TODAY), None, W, TODAY)
        self.assertGreater(dreaded.value, appealing.value)


class Parsing(unittest.TestCase):
    def test_parses_full_task_line(self):
        line = ("- [ ] (CG) Write the plan · est:M · importance:5 · "
                "due:2026-06-16 · energy:high · added:2025-07-20 · avoid:true")
        t = parse_task(line)
        self.assertEqual(t.front, "CG")
        self.assertEqual(t.title, "Write the plan")
        self.assertEqual(t.importance, 5)
        self.assertEqual(t.est, "M")
        self.assertEqual(t.due, date(2026, 6, 16))
        self.assertEqual(t.energy, "high")
        self.assertTrue(t.avoid)
        self.assertFalse(t.done)

    def test_completed_task_is_marked_done(self):
        self.assertTrue(parse_task("- [x] (TS) shipped it").done)

    def test_missing_meta_uses_defaults(self):
        t = parse_task("- [ ] (AT) bare task")
        self.assertEqual(t.est, "1h")
        self.assertIsNone(t.importance)
        self.assertIsNone(t.due)


class Ranking(unittest.TestCase):
    def _board(self):
        b = Board(weights=dict(W))
        b.fronts = {"CG": Front("CG", "Cosmic Guide", 5)}
        return b

    def test_time_filter_excludes_big_tasks(self):
        tasks = [task(title="big", est="L"), task(title="small", est="S")]
        ranked = rank(tasks, self._board(), TODAY, None, max_minutes=30)
        titles = [t.title for t, _ in ranked]
        self.assertIn("small", titles)
        self.assertNotIn("big", titles)

    def test_done_tasks_excluded(self):
        tasks = [task(title="open"), task(title="closed", done=True)]
        ranked = rank(tasks, self._board(), TODAY, None, None)
        self.assertEqual([t.title for t, _ in ranked], ["open"])

    def test_ranked_descending_by_score(self):
        tasks = [task(title="lo", importance=1, est="L"),
                 task(title="hi", importance=5, est="S")]
        ranked = rank(tasks, self._board(), TODAY, None, None)
        self.assertEqual(ranked[0][0].title, "hi")


SAMPLE_BOARD = """# KIROS

## 🔥 Active set
- [ ] (CG) Write the plan · est:M · importance:5

## 📥 Inbox
- a raw thought
- another one
"""


class FileMutations(unittest.TestCase):
    def _tmp(self, text=SAMPLE_BOARD):
        fh = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        fh.write(text)
        fh.close()
        return fh.name

    def test_inbox_raw_captures_non_task_bullets(self):
        board = parse_board(SAMPLE_BOARD)
        self.assertEqual(board.inbox_raw, ["a raw thought", "another one"])

    def test_add_capture_lands_under_inbox(self):
        path = self._tmp()
        self.assertTrue(add_capture(path, "fresh idea"))
        board = parse_board(Path(path).read_text(encoding="utf-8"))
        self.assertIn("fresh idea", board.inbox_raw)

    def test_add_capture_rejects_empty(self):
        path = self._tmp()
        self.assertFalse(add_capture(path, "   "))

    def test_toggle_marks_task_done(self):
        path = self._tmp()
        raw = "- [ ] (CG) Write the plan · est:M · importance:5"
        self.assertTrue(toggle_task_done(path, raw, done=True))
        active = parse_board(Path(path).read_text(encoding="utf-8")).sections["active"]
        self.assertTrue(active[0].done)

    def test_toggle_returns_false_when_no_match(self):
        path = self._tmp()
        self.assertFalse(toggle_task_done(path, "- [ ] (XX) nonexistent task"))


class UrgencyAndDelegate(unittest.TestCase):
    def test_manual_urgency_raises_score(self):
        urgent = score_task(task(importance=3, est="M", urgency=5), None, W, TODAY)
        calm = score_task(task(importance=3, est="M"), None, W, TODAY)
        self.assertGreater(urgent.value, calm.value)

    def test_parse_urgency_and_delegate(self):
        t = parse_task("- [ ] (TS) fix it · urgency:4 · delegate:Kris")
        self.assertEqual(t.urgency, 4)
        self.assertEqual(t.delegate, "Kris")

    def test_delegated_task_is_not_focusable(self):
        self.assertFalse(focusable(task(delegate="Argen")))

    def test_done_task_is_not_focusable(self):
        self.assertFalse(focusable(task(done=True)))

    def test_plain_task_is_focusable(self):
        self.assertTrue(focusable(task()))


class LineFormatting(unittest.TestCase):
    def test_round_trips_through_parse(self):
        original = Task(title="Ship the thing", front="CG", group="Pdf-Styles", importance=5, urgency=3,
                        est="6h", due=date(2026, 6, 20), energy="high", delegate="Udit",
                        url="https://app.asana.com/0/1/2", added=date(2026, 6, 1), avoid=True)
        reparsed = parse_task(format_task_line(original))
        for fieldname in ("title", "front", "group", "importance", "urgency", "est", "due",
                          "energy", "delegate", "url", "added", "avoid"):
            self.assertEqual(getattr(reparsed, fieldname), getattr(original, fieldname), fieldname)

    def test_strips_separator_from_title(self):
        line = format_task_line(Task(title="a · b", front="X"))
        self.assertNotIn("a · b", line)


class CreateAndDelete(unittest.TestCase):
    def _tmp(self):
        fh = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        fh.write("# KIROS\n\n## 🔥 Active set\n- [ ] (CG) existing · est:M\n")
        fh.close()
        return fh.name

    def test_add_task_line_under_lane(self):
        path = self._tmp()
        self.assertTrue(add_task_line(path, "active", "- [ ] (TS) new one · est:S"))
        active = parse_board(Path(path).read_text(encoding="utf-8")).sections["active"]
        self.assertEqual({t.title for t in active}, {"existing", "new one"})

    def test_remove_line(self):
        path = self._tmp()
        self.assertTrue(remove_line(path, "- [ ] (CG) existing · est:M"))
        self.assertEqual(parse_board(Path(path).read_text(encoding="utf-8")).sections.get("active", []), [])


REORDER_BOARD = """# KIROS

## 🔥 Active set
- [ ] (CG) one · est:M
- [ ] (CG) two · est:M
- [ ] (CG) three · est:M

## 📥 Inbox  (raw capture)
- [ ] (CG) keep me · est:S
<!-- a comment that must stay put -->
"""


class ReorderSection(unittest.TestCase):
    def _tmp(self, text=REORDER_BOARD):
        fh = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        fh.write(text)
        fh.close()
        return fh.name

    def _active_titles(self, path):
        board = parse_board(Path(path).read_text(encoding="utf-8"))
        return [t.title for t in board.sections["active"]]

    def test_reorders_task_lines_in_place(self):
        path = self._tmp()
        new_order = ["- [ ] (CG) three · est:M", "- [ ] (CG) one · est:M", "- [ ] (CG) two · est:M"]
        self.assertTrue(reorder_section(path, "active", new_order))
        self.assertEqual(self._active_titles(path), ["three", "one", "two"])

    def test_leaves_other_sections_and_comments_untouched(self):
        path = self._tmp()
        reorder_section(path, "active", ["- [ ] (CG) two · est:M", "- [ ] (CG) one · est:M",
                                        "- [ ] (CG) three · est:M"])
        text = Path(path).read_text(encoding="utf-8")
        self.assertIn("<!-- a comment that must stay put -->", text)
        self.assertEqual([t.title for t in parse_board(text).sections["inbox"]], ["keep me"])

    def test_refuses_when_not_a_permutation(self):
        path = self._tmp()
        # missing "three" → would drop a task; must refuse and leave the file alone
        self.assertFalse(reorder_section(path, "active", ["- [ ] (CG) two · est:M",
                                                         "- [ ] (CG) one · est:M"]))
        self.assertEqual(self._active_titles(path), ["one", "two", "three"])

    def test_already_ordered_is_noop_true(self):
        path = self._tmp()
        same = ["- [ ] (CG) one · est:M", "- [ ] (CG) two · est:M", "- [ ] (CG) three · est:M"]
        self.assertTrue(reorder_section(path, "active", same))
        self.assertEqual(self._active_titles(path), ["one", "two", "three"])

    def test_missing_section_returns_false(self):
        path = self._tmp()
        self.assertFalse(reorder_section(path, "parking", ["- [ ] (CG) one · est:M"]))

    def test_reorders_open_tasks_only_leaving_done_lines_put(self):
        # A completed '[x]' line lingering in a lane must not be part of the reorder
        # (the board shows it in the Done column) — ordered_raws is open tasks only.
        text = ("# KIROS\n\n## 🔥 Active set\n"
                "- [ ] (CG) one · est:M\n- [x] (CG) finished · est:M\n- [ ] (CG) two · est:M\n")
        path = self._tmp(text)
        self.assertTrue(reorder_section(path, "active", ["- [ ] (CG) two · est:M",
                                                        "- [ ] (CG) one · est:M"]))
        lines = [l for l in Path(path).read_text(encoding="utf-8").splitlines() if l.startswith("- [")]
        self.assertEqual(lines, ["- [ ] (CG) two · est:M", "- [x] (CG) finished · est:M",
                                 "- [ ] (CG) one · est:M"])  # done line kept its middle slot


class DayPlan(unittest.TestCase):
    def test_fills_to_capacity(self):
        tasks = [task(est="M"), task(est="M"), task(est="M"), task(est="M")]  # 2 each
        self.assertEqual(len(fill_day_plan(tasks, capacity=6)), 3)  # 2+2+2 = 6

    def test_always_includes_the_frog_even_if_oversized(self):
        tasks = [task(est="XL")]  # 8 > capacity 6
        self.assertEqual(len(fill_day_plan(tasks, capacity=6)), 1)

    def test_respects_effort_already_done(self):
        tasks = [task(est="M"), task(est="M")]  # 2 each
        self.assertEqual(len(fill_day_plan(tasks, capacity=6, effort_done=4)), 1)  # only 2 room left

    def test_caps_item_count_for_tiny_tasks(self):
        tasks = [task(est="S") for _ in range(20)]  # all 1 effort
        self.assertEqual(len(fill_day_plan(tasks, capacity=100, max_items=5)), 5)


COMPANY_BOARD = """# KIROS

## 🏢 Companies
- Atmosa
- Private

## 🎯 Fronts
### Atmosa
- [AT-BIZ] Biz · importance:5 · surface:Atmosa

## 🔥 Active set
"""


class Structure(unittest.TestCase):
    def _tmp(self, text=COMPANY_BOARD):
        fh = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        fh.write(text)
        fh.close()
        return fh.name

    def test_parses_company_registry(self):
        self.assertEqual(parse_board(COMPANY_BOARD).companies, ["Atmosa", "Private"])

    def test_fronts_heading_not_swallowed_by_company_keyword(self):
        # "Fronts (Company...)" must stay a fronts section, not a companies section
        board = parse_board("## 🎯 Fronts (Company › Project)\n- [X] P · surface:Atmosa\n")
        self.assertIn("X", board.fronts)
        self.assertEqual(board.companies, [])

    def test_add_company(self):
        p = self._tmp()
        self.assertTrue(add_company(p, "Studio Solay"))
        self.assertIn("Studio Solay", parse_board(Path(p).read_text(encoding="utf-8")).companies)

    def test_add_company_dedupes(self):
        self.assertFalse(add_company(self._tmp(), "Atmosa"))

    def test_add_front_under_existing_company(self):
        p = self._tmp()
        self.assertTrue(add_front(p, "AT-LOG", "Logistics", "Atmosa", 4))
        fronts = parse_board(Path(p).read_text(encoding="utf-8")).fronts
        self.assertEqual(fronts["AT-LOG"].name, "Logistics")
        self.assertEqual(fronts["AT-LOG"].surface, "Atmosa")
        self.assertEqual(fronts["AT-LOG"].importance, 4)

    def test_add_front_creates_new_company_group(self):
        p = self._tmp()
        add_front(p, "PR-READ", "Reading", "Private", 2)
        self.assertEqual(parse_board(Path(p).read_text(encoding="utf-8")).fronts["PR-READ"].surface, "Private")

    def test_remove_front(self):
        p = self._tmp()
        self.assertTrue(remove_front(p, "AT-BIZ"))
        self.assertNotIn("AT-BIZ", parse_board(Path(p).read_text(encoding="utf-8")).fronts)

    def test_rename_company(self):
        p = self._tmp()
        self.assertTrue(rename_company(p, "Atmosa", "Atmosa Labs"))
        b = parse_board(Path(p).read_text(encoding="utf-8"))
        self.assertIn("Atmosa Labs", b.companies)
        self.assertNotIn("Atmosa", b.companies)
        self.assertEqual(b.fronts["AT-BIZ"].surface, "Atmosa Labs")   # fronts follow the rename

    def test_rename_company_noop(self):
        self.assertFalse(rename_company(self._tmp(), "Atmosa", "Atmosa"))
        self.assertFalse(rename_company(self._tmp(), "Missing", "X"))

    def test_remove_company(self):
        p = self._tmp()
        self.assertTrue(remove_company(p, "Atmosa"))
        b = parse_board(Path(p).read_text(encoding="utf-8"))
        self.assertNotIn("Atmosa", b.companies)
        self.assertNotIn("AT-BIZ", b.fronts)        # its fronts are removed too
        self.assertIn("Private", b.companies)       # other companies untouched

    def test_parse_front_urgency(self):
        b = parse_board("## 🎯 Fronts\n- [X] P · importance:4 · urgency:2 · surface:Atmosa\n")
        self.assertEqual(b.fronts["X"].urgency, 2)

    def test_update_front_importance_and_urgency(self):
        p = self._tmp()
        self.assertTrue(update_front(p, "AT-BIZ", importance=2, urgency=5))
        fr = parse_board(Path(p).read_text(encoding="utf-8")).fronts["AT-BIZ"]
        self.assertEqual((fr.importance, fr.urgency), (2, 5))

    def test_update_front_rename_keeps_importance(self):
        p = self._tmp()
        self.assertTrue(update_front(p, "AT-BIZ", importance=4))
        self.assertTrue(update_front(p, "AT-BIZ", name="Business Ops"))
        fr = parse_board(Path(p).read_text(encoding="utf-8")).fronts["AT-BIZ"]
        self.assertEqual((fr.name, fr.importance), ("Business Ops", 4))

    def test_task_inherits_front_urgency_in_score(self):
        with_front = score_task(task(importance=3, est="M"), Front("X", "x", 3, "", 5), W, TODAY)
        no_front = score_task(task(importance=3, est="M"), Front("X", "x", 3, "", None), W, TODAY)
        self.assertGreater(with_front.value, no_front.value)


if __name__ == "__main__":
    unittest.main()
