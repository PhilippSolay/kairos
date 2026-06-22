"""Integration tests: tenant isolation over real HTTP.

Boots kiros_web.py as a subprocess against a temp data dir, then drives it with
two independent cookie jars (two "browsers") to prove that one user can never
see another's data, and that auth, CSRF, and admin gating are enforced.
"""
import http.cookiejar
import json
import os
import shutil
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

    def get_raw(self, path: str):
        """GET returning (status, content_type, body_bytes, headers) for non-JSON endpoints."""
        try:
            with self.opener.open(urllib.request.Request(self.base + path), timeout=5) as r:
                return r.status, r.headers.get("Content-Type"), r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            e.close()
            return e.code, None, b"", {}

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


class _ServerCase(unittest.TestCase):
    """Boots an isolated kiros_web.py + temp data dir per subclass (own admin bootstrap)."""

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


class TestIsolation(_ServerCase):
    def test_tenant_isolation_and_guards(self):
        a, b = Client(self.base), Client(self.base)

        # First signup bootstraps to admin; second is a regular user.
        self.assertEqual(a.post("/api/auth/signup",
                                {"email": "a@x.co", "name": "A", "password": "password1"},
                                with_csrf=False)[0], 200)
        self.assertEqual(b.post("/api/auth/signup",
                                {"email": "b@x.co", "name": "B", "password": "password1"},
                                with_csrf=False)[0], 200)

        # A creates a private task in their starter front (PR-HOME exists in STARTER_BOARD).
        status, _ = a.post("/api/task/save",
                           {"fields": {"title": "SECRET sauna quote", "front": "PR-HOME", "est": "1h"},
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


class TestCustomIcons(_ServerCase):
    def test_custom_icon_upload_serve_and_isolation(self):
        a, b = Client(self.base), Client(self.base)
        a.post("/api/auth/signup", {"email": "ic_a@x.co", "name": "A", "password": "password1"}, with_csrf=False)
        b.post("/api/auth/signup", {"email": "ic_b@x.co", "name": "B", "password": "password1"}, with_csrf=False)

        good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>'

        # Upload needs a session and a CSRF token.
        self.assertEqual(Client(self.base).post("/api/icon", {"svg": good})[0], 401)
        self.assertEqual(a.post("/api/icon", {"svg": good}, with_csrf=False)[0], 403)

        # Valid upload → id; serving it back is a sandboxed, nosniff SVG.
        status, body = a.post("/api/icon", {"svg": good})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        iid = body["id"]
        st, ctype, raw, hdrs = a.get_raw("/api/icon/" + iid)
        self.assertEqual(st, 200)
        self.assertEqual(ctype, "image/svg+xml")
        self.assertIn(b"<svg", raw)
        self.assertEqual(hdrs.get("X-Content-Type-Options"), "nosniff")
        self.assertIn("sandbox", hdrs.get("Content-Security-Policy", ""))

        # Isolation: B cannot fetch A's icon (serve path derives from B's own uid).
        self.assertEqual(b.get_raw("/api/icon/" + iid)[0], 404)

        # Content-addressed: re-uploading the same SVG returns the same id and keeps one file on disk.
        self.assertEqual(a.post("/api/icon", {"svg": good})[1]["id"], iid)
        self.assertEqual(len(list(Path(self.tmp).glob("users/*/icons/*.svg"))), 1)

        # Malicious / invalid SVGs are rejected at upload.
        for bad in (
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><rect/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil/x.png"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg"><animateTransform attributeName="x"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>',
            '<html><body>nope</body></html>',
        ):
            self.assertEqual(a.post("/api/icon", {"svg": bad})[0], 400)

        # Bad ids never traverse out of the per-user icons dir.
        self.assertEqual(a.get_raw("/api/icon/not-hex-..%2F..%2Fprefs")[0], 404)
        self.assertEqual(a.get_raw("/api/icon/deadbeefdeadbeef")[0], 404)  # well-formed but absent


class TestSvgValidation(unittest.TestCase):
    """Unit coverage for the SVG sanitiser (no server needed)."""

    def setUp(self):
        import kiros_web
        self.validate = kiros_web.validate_svg

    def test_accepts_clean_svg(self):
        clean, err = self.validate('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>')
        self.assertIsNone(err)
        self.assertIn("<svg", clean)

    def test_rejects_unsafe_or_invalid(self):
        for c in (
            "",
            "<svg><script>alert(1)</script></svg>",
            '<svg onload="x()"><rect/></svg>',
            '<svg><rect onclick="x()"/></svg>',
            "<svg><foreignObject/></svg>",
            '<svg><image href="https://evil/x"/></svg>',
            '<svg><image href="//evil/x"/></svg>',
            '<svg><a href="javascript:alert(1)"/></svg>',
            '<!DOCTYPE svg [<!ENTITY a "b">]><svg/>',
            "<html>no</html>",
            "<svg><rect>",            # malformed XML
            "<div><svg/></div>",      # well-formed but root isn't <svg>
        ):
            clean, err = self.validate(c)
            self.assertIsNotNone(err, f"should reject: {c!r}")
            self.assertIsNone(clean)

    def test_rejects_oversize(self):
        big = '<svg xmlns="http://www.w3.org/2000/svg">' + "<rect/>" * 20000 + "</svg>"
        _, err = self.validate(big)
        self.assertIsNotNone(err)


class TestIconGC(unittest.TestCase):
    """Unit coverage for orphan-icon reaping (no server; USERS_DIR pointed at a tmp dir)."""

    def setUp(self):
        import kiros_web
        self.kw = kiros_web
        self.tmp = tempfile.mkdtemp()
        self._orig = kiros_web.USERS_DIR
        kiros_web.USERS_DIR = Path(self.tmp) / "users"

    def tearDown(self):
        self.kw.USERS_DIR = self._orig
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_prune_removes_only_unreferenced(self):
        kw, uid = self.kw, "u1"
        d = kw.icons_dir(uid)
        d.mkdir(parents=True, exist_ok=True)
        for name in ("aaaaaa", "bbbbbb", "cccccc"):
            (d / (name + ".svg")).write_text("<svg/>", encoding="utf-8")
        kw.save_prefs(uid, {"companyIcons": {"X": "custom:aaaaaa", "Y": "home"}})  # only aaaaaa referenced

        self.assertEqual(kw.prune_unreferenced_icons(uid), 2)
        self.assertTrue((d / "aaaaaa.svg").exists())     # referenced → kept
        self.assertFalse((d / "bbbbbb.svg").exists())    # orphan → reaped
        self.assertFalse((d / "cccccc.svg").exists())

        # keep= protects an id mid-upload even though no company references it yet.
        (d / "dddddd.svg").write_text("<svg/>", encoding="utf-8")
        self.assertEqual(kw.prune_unreferenced_icons(uid, keep={"dddddd"}), 0)
        self.assertTrue((d / "dddddd.svg").exists())


if __name__ == "__main__":
    unittest.main()
