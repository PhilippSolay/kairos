"""Tests for the identity store + auth core (store.py, auth.py)."""
import tempfile
import unittest
from pathlib import Path

import auth
from store import Store


def fresh_store() -> Store:
    tmp = tempfile.mkdtemp()
    return Store(Path(tmp) / "kiros.db")


class TestPasswordHashing(unittest.TestCase):
    def test_hash_is_not_plaintext_and_verifies(self):
        h = auth.hash_password("correct horse battery")
        self.assertNotIn("correct horse battery", h)
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(auth.verify_password("correct horse battery", h))

    def test_wrong_password_fails(self):
        h = auth.hash_password("s3cret-pass")
        self.assertFalse(auth.verify_password("s3cret-Pass", h))
        self.assertFalse(auth.verify_password("", h))

    def test_salt_makes_hashes_unique(self):
        self.assertNotEqual(auth.hash_password("same"), auth.hash_password("same"))

    def test_garbage_stored_value_is_rejected_not_crash(self):
        self.assertFalse(auth.verify_password("x", "not-a-valid-hash"))
        self.assertFalse(auth.verify_password("x", ""))


class TestTokensAndValidation(unittest.TestCase):
    def test_tokens_unique_and_hash_stable(self):
        self.assertNotEqual(auth.new_token(), auth.new_token())
        self.assertEqual(auth.token_hash("abc"), auth.token_hash("abc"))
        self.assertNotEqual(auth.token_hash("abc"), auth.token_hash("abd"))

    def test_email_validation(self):
        self.assertTrue(auth.valid_email("a@b.co"))
        for bad in ("", "a@b", "no-at.com", "a b@c.com", "x@y." + "z" * 300):
            self.assertFalse(auth.valid_email(bad))

    def test_password_problem(self):
        self.assertIsNone(auth.password_problem("longenough"))
        self.assertIsNotNone(auth.password_problem("short"))
        self.assertIsNotNone(auth.password_problem(""))

    def test_csrf_double_submit(self):
        self.assertTrue(auth.csrf_ok("tok", "tok"))
        self.assertFalse(auth.csrf_ok("tok", "other"))
        self.assertFalse(auth.csrf_ok("", ""))


class TestRateLimiter(unittest.TestCase):
    def test_blocks_after_max(self):
        rl = auth.RateLimiter(max_hits=3, window_seconds=100)
        self.assertTrue(all(rl.allow("ip") for _ in range(3)))
        self.assertFalse(rl.allow("ip"))

    def test_keys_are_independent(self):
        rl = auth.RateLimiter(max_hits=1, window_seconds=100)
        self.assertTrue(rl.allow("a"))
        self.assertTrue(rl.allow("b"))
        self.assertFalse(rl.allow("a"))


class TestStoreUsers(unittest.TestCase):
    def setUp(self):
        self.store = fresh_store()

    def test_create_and_fetch_case_insensitive(self):
        self.store.create_user("u1", "Me@Example.com", "Me", "h")
        self.assertEqual(self.store.get_user("u1")["email"], "Me@Example.com")
        self.assertIsNotNone(self.store.get_user_by_email("me@example.com"))
        self.assertTrue(self.store.email_exists("ME@EXAMPLE.COM"))

    def test_duplicate_email_rejected(self):
        self.store.create_user("u1", "a@b.co", "A", "h")
        with self.assertRaises(Exception):
            self.store.create_user("u2", "A@B.CO", "A2", "h2")

    def test_set_password_and_name(self):
        self.store.create_user("u1", "a@b.co", "A", "h")
        self.store.set_password("u1", "h2")
        self.store.set_name("u1", "Renamed")
        u = self.store.get_user("u1")
        self.assertEqual(u["pw_hash"], "h2")
        self.assertEqual(u["name"], "Renamed")

    def test_count_and_list(self):
        self.assertEqual(self.store.count_users(), 0)
        self.store.create_user("u1", "a@b.co", "A", "h")
        self.store.create_user("u2", "c@d.co", "C", "h")
        self.assertEqual(self.store.count_users(), 2)
        self.assertEqual(len(self.store.list_users()), 2)


class TestSessions(unittest.TestCase):
    def setUp(self):
        self.store = fresh_store()
        self.store.create_user("u1", "a@b.co", "A", "h")

    def test_issue_and_resolve(self):
        token = auth.issue_session(self.store, "u1")
        user = auth.user_for_session(self.store, token)
        self.assertEqual(user["id"], "u1")

    def test_bad_or_missing_token(self):
        auth.issue_session(self.store, "u1")
        self.assertIsNone(auth.user_for_session(self.store, "wrong-token"))
        self.assertIsNone(auth.user_for_session(self.store, ""))

    def test_expired_session(self):
        self.store.create_session(auth.token_hash("t"), "u1", ttl_days=-1)
        self.assertIsNone(self.store.session_user(auth.token_hash("t")))

    def test_deactivated_user_session_invalid(self):
        token = auth.issue_session(self.store, "u1")
        self.store.deactivate("u1")
        self.assertIsNone(auth.user_for_session(self.store, token))

    def test_logout(self):
        token = auth.issue_session(self.store, "u1")
        auth.end_session(self.store, token)
        self.assertIsNone(auth.user_for_session(self.store, token))


class TestResets(unittest.TestCase):
    def setUp(self):
        self.store = fresh_store()
        self.uid, _ = (lambda u: (u["id"], None))(
            auth.signup(self.store, "a@b.co", "A", "password1")[0])

    def test_begin_reset_unknown_returns_none(self):
        self.assertIsNone(auth.begin_reset(self.store, "nobody@x.co"))

    def test_full_reset_flow_single_use(self):
        token = auth.begin_reset(self.store, "a@b.co")
        self.assertIsNotNone(token)
        uid, err = auth.complete_reset(self.store, token, "newpassword")
        self.assertIsNone(err)
        self.assertTrue(auth.verify_password("newpassword",
                                             self.store.get_user(uid)["pw_hash"]))
        # token cannot be reused
        _, err2 = auth.complete_reset(self.store, token, "another1")
        self.assertIsNotNone(err2)

    def test_expired_reset_rejected(self):
        self.store.create_reset(auth.token_hash("r"), self.uid, ttl_minutes=-1)
        uid, err = auth.complete_reset(self.store, "r", "newpassword")
        self.assertIsNone(uid)
        self.assertIsNotNone(err)

    def test_reset_invalidates_sessions(self):
        token_sess = auth.issue_session(self.store, self.uid)
        rt = auth.begin_reset(self.store, "a@b.co")
        auth.complete_reset(self.store, rt, "newpassword")
        self.assertIsNone(auth.user_for_session(self.store, token_sess))


class TestSignupLogin(unittest.TestCase):
    def setUp(self):
        self.store = fresh_store()

    def test_first_user_is_admin_second_is_not(self):
        u1, _ = auth.signup(self.store, "first@x.co", "First", "password1")
        u2, _ = auth.signup(self.store, "second@x.co", "Second", "password1")
        self.assertEqual(u1["is_admin"], 1)
        self.assertEqual(u2["is_admin"], 0)

    def test_signup_validation(self):
        self.assertIsNotNone(auth.signup(self.store, "bad-email", "X", "password1")[1])
        self.assertIsNotNone(auth.signup(self.store, "ok@x.co", "X", "short")[1])
        auth.signup(self.store, "dup@x.co", "X", "password1")
        self.assertIsNotNone(auth.signup(self.store, "DUP@x.co", "X", "password1")[1])

    def test_login(self):
        auth.signup(self.store, "a@b.co", "A", "password1")
        self.assertIsNotNone(auth.login(self.store, "a@b.co", "password1")[0])
        self.assertIsNone(auth.login(self.store, "a@b.co", "wrong")[0])
        self.assertIsNone(auth.login(self.store, "unknown@b.co", "password1")[0])

    def test_login_blocked_when_deactivated(self):
        u, _ = auth.signup(self.store, "a@b.co", "A", "password1")
        self.store.deactivate(u["id"])
        self.assertIsNone(auth.login(self.store, "a@b.co", "password1")[0])


if __name__ == "__main__":
    unittest.main()
