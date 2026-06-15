"""Auth logic for multi-user Kiros — stdlib only.

`store.py` persists identity; this module owns the crypto and the request glue:
password hashing (scrypt), session/token generation, CSRF, rate limiting, and
the signup/login orchestration. Nothing here interpolates user input into SQL.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time

# --- tunables ---------------------------------------------------------------
MIN_PASSWORD = 8
SCRYPT_N, SCRYPT_R, SCRYPT_P = 16384, 8, 1          # ~16 MB, interactive-fast
SCRYPT_MAXMEM = 64 * 1024 * 1024

SESSION_COOKIE = "kiros_session"
CSRF_COOKIE = "kiros_csrf"
CSRF_HEADER = "X-Kiros-CSRF"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --- password hashing (scrypt, memory-hard, stdlib) -------------------------
def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R,
                        p=SCRYPT_P, maxmem=SCRYPT_MAXMEM)
    return "scrypt$%d$%d$%d$%s$%s" % (SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.hex(), dk.hex())


def verify_password(pw: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, hash_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(pw.encode("utf-8"), salt=bytes.fromhex(salt_hex),
                            n=int(n), r=int(r), p=int(p), maxmem=SCRYPT_MAXMEM)
    except (ValueError, TypeError, AttributeError):
        return False
    return hmac.compare_digest(dk.hex(), hash_hex)


# --- tokens / ids -----------------------------------------------------------
def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    """What we store/look up by — the raw token lives only in the cookie/email."""
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def new_uid() -> str:
    return secrets.token_hex(16)


# --- validation -------------------------------------------------------------
def valid_email(email: str) -> bool:
    email = (email or "").strip()
    return bool(_EMAIL_RE.match(email)) and len(email) <= 254


def password_problem(pw: str):
    if not pw or len(pw) < MIN_PASSWORD:
        return "Password must be at least %d characters." % MIN_PASSWORD
    return None


# --- CSRF (double-submit) ---------------------------------------------------
def csrf_ok(cookie_val: str, header_val: str) -> bool:
    return bool(cookie_val) and bool(header_val) and hmac.compare_digest(cookie_val, header_val)


# --- rate limiting (best-effort, in-memory sliding window) ------------------
class RateLimiter:
    def __init__(self, max_hits: int = 8, window_seconds: int = 300):
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, list] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._hits.get(key, []) if now - t < self.window]
            recent.append(now)
            self._hits[key] = recent
            return len(recent) <= self.max_hits


# --- sessions ---------------------------------------------------------------
def issue_session(store, uid: str) -> str:
    """Create a session and return the RAW token to put in the cookie."""
    token = new_token()
    store.create_session(token_hash(token), uid)
    return token


def user_for_session(store, cookie_token: str):
    if not cookie_token:
        return None
    return store.session_user(token_hash(cookie_token))


def end_session(store, cookie_token: str) -> None:
    if cookie_token:
        store.delete_session(token_hash(cookie_token))


# --- orchestration ----------------------------------------------------------
def signup(store, email: str, name: str, password: str):
    """Create an active user. Returns (user_dict, None) or (None, error_message).

    The very first account on a fresh install becomes admin (bootstrap); the
    migration relies on this to make Philipp's account the admin.
    """
    email = (email or "").strip().lower()
    if not valid_email(email):
        return None, "Enter a valid email address."
    problem = password_problem(password)
    if problem:
        return None, problem
    if store.email_exists(email):
        return None, "An account with that email already exists."
    uid = new_uid()
    is_admin = 1 if store.count_users() == 0 else 0
    store.create_user(uid, email, (name or "").strip(), hash_password(password),
                      is_admin=is_admin, ics_token=new_token())
    return store.get_user(uid), None


def login(store, email: str, password: str):
    """Returns (user_dict, None) or (None, error_message). One generic error
    for every failure so we never reveal whether an email exists."""
    email = (email or "").strip().lower()
    user = store.get_user_by_email(email)
    if not user or not user["is_active"] or not verify_password(password, user["pw_hash"]):
        return None, "Wrong email or password."
    return user, None


def begin_reset(store, email: str):
    """Create a reset token for an existing active user. Returns the RAW token
    (to email/log) or None — callers MUST respond identically either way so the
    endpoint can't be used to enumerate accounts."""
    user = store.get_user_by_email((email or "").strip().lower())
    if not user or not user["is_active"]:
        return None
    token = new_token()
    store.create_reset(token_hash(token), user["id"])
    return token


def complete_reset(store, token: str, new_password: str):
    """Returns (uid, None) or (None, error_message)."""
    problem = password_problem(new_password)
    if problem:
        return None, problem
    uid = store.consume_reset(token_hash(token))
    if not uid:
        return None, "This reset link is invalid or has expired."
    store.set_password(uid, hash_password(new_password))
    store.delete_user_sessions(uid)   # force re-login everywhere after a reset
    return uid, None
