"""Service-worker version injection (offline-support Phase 0): GET /sw.js must
come back with __SW_VERSION__ / __SW_ASSETS__ replaced by the deploy's combined
shell md5, and the precache URLs carry that same ?v= so a changed shell asset
reinstalls the SW (fresh precache, no Cloudflare stale-asset trap). No server
boot; calls _serve_sw directly.  Run:  python3 -m unittest -v test_offline_sw
"""
import json
import os
import re
import tempfile
import unittest

_TMP = tempfile.mkdtemp(prefix="kiros-sw-")
os.environ["KIROS_DATA"] = _TMP

import kiros_web as web  # noqa: E402


class _Handler(web.Handler):
    """HTTP plumbing stubbed so _serve_sw can run in isolation; _send captures
    the (status, body, content_type) it would have written."""
    def __init__(self):
        self.sent = None

    def _send(self, status, body, content_type, cookies=None, extra=None):
        self.sent = (status, body, content_type)


class ServiceWorkerInjection(unittest.TestCase):
    def setUp(self):
        self.h = _Handler()

    def _render(self):
        self.h._serve_sw()
        self.assertIsNotNone(self.h.sent, "_serve_sw sent nothing")
        return self.h.sent

    def test_served_as_javascript_with_tokens_replaced(self):
        status, body, ctype = self._render()
        self.assertEqual(status, 200)
        self.assertEqual(ctype, "text/javascript")
        js = body.decode("utf-8")
        self.assertNotIn("__SW_VERSION__", js)
        self.assertNotIn("__SW_ASSETS__", js)

    def test_version_is_md5_hex_and_assets_carry_it(self):
        _, body, _ = self._render()
        js = body.decode("utf-8")
        m = re.search(r'const VERSION = "([0-9a-f]{8})";', js)
        self.assertIsNotNone(m, "VERSION should be an 8-char md5 hex")
        v = m.group(1)
        m2 = re.search(r'const ASSETS = (\[.*\]);', js)
        self.assertIsNotNone(m2, "ASSETS should be injected as a JSON array")
        assets = json.loads(m2.group(1))
        self.assertIn("/", assets)             # navigation start_url
        self.assertIn("/index.html", assets)
        for shell in ("/app.js", "/offline.js", "/styles.css", "/manifest.webmanifest"):
            self.assertIn("%s?v=%s" % (shell, v), assets,
                          "%s must be precached at the deploy version" % shell)

    def test_deterministic_for_same_shell(self):
        # The cron-pull deploy relies on identical image bytes → identical SW, so
        # an unchanged shell must not churn the version (no spurious reinstalls).
        _, b1, _ = self._render()
        h2 = _Handler()
        h2._serve_sw()
        self.assertEqual(b1, h2.sent[1])


if __name__ == "__main__":
    unittest.main()
