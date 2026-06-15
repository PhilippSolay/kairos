"""SQLite identity store for multi-user Kiros — stdlib `sqlite3` only.

Holds ONLY identity: users, sessions, and password-reset tokens. Board data
(tasks) never lives here — it stays in per-user markdown files under
`<DATA>/users/<uid>/`, read/written by the unchanged `kiros.py` engine.

Repository pattern: every method is a thin, parameterized data-access call.
No crypto here — `auth.py` hashes passwords and tokens before they arrive.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

SESSION_TTL_DAYS = 30
RESET_TTL_MINUTES = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name         TEXT NOT NULL DEFAULT '',
  pw_hash      TEXT NOT NULL,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  ics_token    TEXT UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,            -- sha256(cookie token), hex
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,            -- sha256(emailed token), hex
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


class Store:
    """Thin SQLite wrapper. One connection per call keeps it thread-safe under
    the ThreadingHTTPServer; WAL keeps concurrent readers/writers happy."""

    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _one(self, sql: str, args: tuple = ()):  # -> dict | None
        with self._conn() as c:
            row = c.execute(sql, args).fetchone()
            return dict(row) if row else None

    def _all(self, sql: str, args: tuple = ()) -> list:
        with self._conn() as c:
            return [dict(r) for r in c.execute(sql, args).fetchall()]

    def _exec(self, sql: str, args: tuple = ()) -> None:
        with self._conn() as c:
            c.execute(sql, args)

    # ---- users -------------------------------------------------------------
    def create_user(self, uid: str, email: str, name: str, pw_hash: str,
                     is_admin: int = 0, ics_token: str | None = None) -> None:
        self._exec(
            "INSERT INTO users (id,email,name,pw_hash,is_admin,is_active,ics_token,created_at) "
            "VALUES (?,?,?,?,?,1,?,?)",
            (uid, email, name, pw_hash, int(is_admin), ics_token, _iso(_now())),
        )

    def get_user(self, uid: str):
        return self._one("SELECT * FROM users WHERE id=?", (uid,))

    def get_user_by_email(self, email: str):
        return self._one("SELECT * FROM users WHERE email=? COLLATE NOCASE", ((email or "").strip(),))

    def get_user_by_ics_token(self, token: str):
        if not token:
            return None
        return self._one("SELECT * FROM users WHERE ics_token=?", (token,))

    def email_exists(self, email: str) -> bool:
        return self.get_user_by_email(email) is not None

    def count_users(self) -> int:
        return self._one("SELECT COUNT(*) AS n FROM users")["n"]

    def list_users(self) -> list:
        return self._all("SELECT * FROM users ORDER BY created_at")

    def set_password(self, uid: str, pw_hash: str) -> None:
        self._exec("UPDATE users SET pw_hash=? WHERE id=?", (pw_hash, uid))

    def set_name(self, uid: str, name: str) -> None:
        self._exec("UPDATE users SET name=? WHERE id=?", (name, uid))

    def deactivate(self, uid: str) -> None:
        """Soft delete: block login + kill sessions. Board data is left on disk."""
        self._exec("UPDATE users SET is_active=0 WHERE id=?", (uid,))
        self.delete_user_sessions(uid)

    def touch_last_seen(self, uid: str) -> None:
        self._exec("UPDATE users SET last_seen_at=? WHERE id=?", (_iso(_now()), uid))

    # ---- sessions ----------------------------------------------------------
    def create_session(self, sid: str, uid: str, ttl_days: int = SESSION_TTL_DAYS) -> None:
        now = _now()
        self._exec(
            "INSERT OR REPLACE INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)",
            (sid, uid, _iso(now), _iso(now + timedelta(days=ttl_days))),
        )

    def session_user(self, sid: str):
        """The ACTIVE user for a valid, unexpired session — else None.

        This join is the isolation backbone: a request's identity is resolved
        from the session id alone, never from anything the client supplies.
        """
        if not sid:
            return None
        return self._one(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.id=? AND s.expires_at > ? AND u.is_active = 1",
            (sid, _iso(_now())),
        )

    def delete_session(self, sid: str) -> None:
        self._exec("DELETE FROM sessions WHERE id=?", (sid,))

    def delete_user_sessions(self, uid: str) -> None:
        self._exec("DELETE FROM sessions WHERE user_id=?", (uid,))

    # ---- password resets ---------------------------------------------------
    def create_reset(self, rid: str, uid: str, ttl_minutes: int = RESET_TTL_MINUTES) -> None:
        now = _now()
        self._exec(
            "INSERT OR REPLACE INTO password_resets (id,user_id,created_at,expires_at,used) "
            "VALUES (?,?,?,?,0)",
            (rid, uid, _iso(now), _iso(now + timedelta(minutes=ttl_minutes))),
        )

    def consume_reset(self, rid: str):
        """Return uid if the token is valid+unused+unexpired (marking it used), else None."""
        with self._conn() as c:
            row = c.execute(
                "SELECT user_id FROM password_resets WHERE id=? AND used=0 AND expires_at > ?",
                (rid, _iso(_now())),
            ).fetchone()
            if not row:
                return None
            c.execute("UPDATE password_resets SET used=1 WHERE id=?", (rid,))
            return row["user_id"]
