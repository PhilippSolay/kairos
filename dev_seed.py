#!/usr/bin/env python3
"""Local DEV seed — NOT for production. Creates an admin + a friend with two
DISTINCT sample boards so auth, per-user isolation, and the admin page can be
eyeballed locally. Idempotent (re-writes the sample boards each run).

    KIROS_DATA=./data DEV_PASS=kiros-dev-pass python3 dev_seed.py
"""
import os
from pathlib import Path

import auth
from store import Store

DATA = Path(os.environ.get("KIROS_DATA", "data"))
USERS = DATA / "users"
DEV_PASS = os.environ.get("DEV_PASS", "kiros-dev-pass")

_TUNING = """## ⚙️ Tuning
- imp_mult = 2.0
- urg_mult = 1.5
- deadline_max = 12.0
- overdue_bonus = 6.0
- stale_days = 3
- stale_boost = 0.12
- stale_cap = 0.6
- avoid_flag_boost = 0.6
- wip_cap = 3
- day_capacity = 6
"""

ADMIN_BOARD = f"""# KIROS

{_TUNING}
## 🏢 Companies
- Atmosa
- Studio Solay

## 🎯 Fronts

### Atmosa
- [AT-SALE] Sales · importance:5 · surface:Atmosa
- [AT-PRD] Production · importance:4 · surface:Atmosa

### Studio Solay
- [SS-CURA] Cura App · importance:3 · surface:Studio Solay

## 🔥 Active set
- [ ] (AT-SALE) Send sauna quote to the Ubud villa · importance:5 · urgency:5 · est:1h · added:2026-06-12
- [ ] (SS-CURA) Fix Cura onboarding crash · importance:4 · urgency:3 · est:2h · added:2026-06-13

## ✅ Today
- [ ] (AT-PRD) Confirm cedar delivery date · importance:4 · urgency:4 · est:30m · added:2026-06-14

## 🤝 Delegated

## 📥 Inbox

## 🅿️ Parking lot

## 🏁 Done
"""

FRIEND_BOARD = f"""# KIROS

{_TUNING}
## 🏢 Companies
- Acme

## 🎯 Fronts

### Acme
- [AC-GEN] General · importance:3 · surface:Acme

## 🔥 Active set
- [ ] (AC-GEN) Draft the Acme pitch deck · importance:4 · urgency:4 · est:2h · added:2026-06-14

## ✅ Today

## 🤝 Delegated

## 📥 Inbox

## 🅿️ Parking lot

## 🏁 Done
"""


def seed(store: Store, email: str, name: str, is_admin: int, board_text: str) -> str:
    u = store.get_user_by_email(email)
    if u:
        uid = u["id"]
    else:
        uid = auth.new_uid()
        store.create_user(uid, email, name, auth.hash_password(DEV_PASS),
                          is_admin=is_admin, ics_token=auth.new_token())
    d = USERS / uid
    d.mkdir(parents=True, exist_ok=True)
    (d / "KIROS.md").write_text(board_text, encoding="utf-8")
    return uid


def main() -> None:
    USERS.mkdir(parents=True, exist_ok=True)
    store = Store(DATA / "kiros.db")
    seed(store, "philipp.solay@gmail.com", "Philipp", 1, ADMIN_BOARD)
    seed(store, "friend@example.com", "Sam", 0, FRIEND_BOARD)
    print(f"  seeded admin (philipp.solay@gmail.com) + friend (friend@example.com), password: {DEV_PASS}")


if __name__ == "__main__":
    main()
