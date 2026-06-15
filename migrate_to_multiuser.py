#!/usr/bin/env python3
"""One-shot migration: single-user Kiros -> multi-user. Idempotent.

Creates kiros.db, seeds the admin account, and (optionally) relocates the
existing single-user board + sidecars into that admin's per-user data dir.
The admin password is read from the env (the old Basic-Auth value) and only its
scrypt hash is ever stored — the plaintext is never written anywhere.

Usage:
    KIROS_DATA=./data \\
    KIROS_AUTH_PASS='<the old basic-auth password>' \\
    ADMIN_EMAIL=philipp.solay@gmail.com \\
    SOURCE_DATA=/path/holding/the/old/KIROS.md \\   # optional
    python3 migrate_to_multiuser.py [--copy]        # --copy keeps source files (default: move)
"""
import os
import shutil
import sys
from pathlib import Path

import auth
from store import Store

DATA = Path(os.environ.get("KIROS_DATA", "data"))
DB_PATH = Path(os.environ.get("KIROS_DB") or (DATA / "kiros.db"))
USERS = DATA / "users"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "philipp.solay@gmail.com").strip().lower()
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Philipp")
ADMIN_PASS = os.environ.get("KIROS_AUTH_PASS") or os.environ.get("ADMIN_PASS")
SOURCE = Path(os.environ["SOURCE_DATA"]) if os.environ.get("SOURCE_DATA") else None
COPY = "--copy" in sys.argv
SIDECARS = ("KIROS.md", "descriptions.json", "completions.jsonl")


def main() -> None:
    if not ADMIN_PASS:
        sys.exit("ERROR: set KIROS_AUTH_PASS (the admin's password) in the environment.")
    USERS.mkdir(parents=True, exist_ok=True)
    store = Store(DB_PATH)

    existing = store.get_user_by_email(ADMIN_EMAIL)
    if existing:
        uid = existing["id"]
        print(f"  admin already exists: {ADMIN_EMAIL} ({uid}) — leaving password as-is")
    else:
        uid = auth.new_uid()
        store.create_user(uid, ADMIN_EMAIL, ADMIN_NAME, auth.hash_password(ADMIN_PASS),
                          is_admin=1, ics_token=auth.new_token())
        print(f"  created admin {ADMIN_EMAIL} ({uid}) is_admin=1")

    dest = USERS / uid
    dest.mkdir(parents=True, exist_ok=True)
    if SOURCE:
        for fn in SIDECARS:
            src = SOURCE / fn
            target = dest / fn
            if not src.exists():
                continue
            if target.exists():
                print(f"  skip {fn} (already present in user dir)")
                continue
            (shutil.copy2 if COPY else shutil.move)(str(src), str(target))
            print(f"  {'copied' if COPY else 'moved'} {fn} -> {target}")
    # If no board ended up in place, the server seeds a starter on first login.
    print("  done. (sign in at /login as the admin)")


if __name__ == "__main__":
    main()
