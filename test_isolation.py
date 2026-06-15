"""Integration tests: tenant isolation over real HTTP.

Boots kiros_web.py as a subprocess against a temp data dir, then drives it with
two independent cookie jars (two "browsers") to prove that one user can never
see another's data, and that auth, CSRF, and admin gating are enforced.
"""
import http.cookiejar
import json
import os
import socket
import subprocess
import sys
import time
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Client:
    """A single 'browser' — its own cookie jar, so two Clients are two users."""

    def __init__(self, base: str):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def _csrf(self) -> str:
        return next((c.value for c in self.jar if c.name == "kiros_csrf"), "")

    def get(self, path: str):
        try:
            with self.opener.open(urllib.request.Request(self.base + path), timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            e.close()
            return e.code, None

    def post(self, path: str, data: dict, with_csrf: bool = True):
        headers = {"Content-Type": "application/json"}
        if with_csrf:
            headers["X-Kiros-CSRF"] = self._csrf()
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode(),
                                     headers=headers, method="POST")
        try:
            with self.opener.open(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read() or b"null")
            except ValueError:
                body = None
            e.close()
            return e.code, body


class TestIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        env = dict(os.environ, KIROS_DATA=cls.tmp, KIROS_DEV="1",
                   KIROS_PORT=str(cls.port), KIROS_NO_OPEN="1")
        cls.proc = subprocess.Popen([sys.executable, str(HERE / "kiros_web.py"), "--no-open"],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                urllib.request.urlopen(cls.base + "/login", timeout=1).close()
                return
            except urllib.error.HTTPError:
                return  # any HTTP response means it's up
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("server did not start in time")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=5)
        except Exception:
            cls.proc.kill()

    def test_tenant_isolation_and_guards(self):
        a, b = Client(self.base), Client(self.base)

        # First signup bootstraps to admin; second is a regular user.
        self.assertEqual(a.post("/api/auth/signup",
                                {"email": "a@x.co", "name": "A", "password": "password1"},
                                with_csrf=False)[0], 200)
        self.assertEqual(b.post("/api/auth/signup",
                                {"email": "b@x.co", "name": "B", "password": "password1"},
                                with_csrf=False)[0], 200)

        # A creates a private task in their starter front (PR-GEN exists in STARTER_BOARD).
        status, _ = a.post("/api/task/save",
                           {"fields": {"title": "SECRET sauna quote", "front": "PR-GEN", "est": "1h"},
                            "lane": "active"})
        self.assertEqual(status, 200)

        # A sees it; B must never see it.
        a_titles = " ".join(t["title"] for t in a.get("/api/tasks")[1]["tasks"])
        b_titles = " ".join(t["title"] for t in b.get("/api/tasks")[1]["tasks"])
        self.assertIn("SECRET", a_titles)
        self.assertNotIn("SECRET", b_titles)

        # No session at all → API is 401.
        self.assertEqual(Client(self.base).get("/api/tasks")[0], 401)

        # Valid session but no CSRF header → 403 on a state change.
        self.assertEqual(a.post("/api/capture", {"text": "x"}, with_csrf=False)[0], 403)

        # Admin gating: A (first user) admin → 200; B → 403.
        self.assertEqual(a.get("/api/admin/users")[0], 200)
        self.assertEqual(b.get("/api/admin/users")[0], 403)

        # A cannot reach B's calendar feed contents are per-token (different tokens).
        a_me = a.get("/api/me")[1]
        b_me = b.get("/api/me")[1]
        self.assertNotEqual(a_me["icsToken"], b_me["icsToken"])

        # Logout invalidates the session.
        a.post("/api/auth/logout", {})
        self.assertEqual(a.get("/api/tasks")[0], 401)


if __name__ == "__main__":
    unittest.main()
