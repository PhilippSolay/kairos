# Deploying Kiros (multi-user) — kairos.solay.cloud

Kiros is a stdlib-only Python app (no build step). It runs in one small container behind
your Traefik proxy. **Multi-user:** every user signs up / logs in (cookie sessions, CSRF,
scrypt-hashed passwords) — there is **no HTTP Basic Auth**. Identity lives in
`data/kiros.db`; each user's board + sidecars live in `data/users/<uid>/`.

```
internet ──TLS──▶ Traefik (kairos.solay.cloud) ──http──▶ kairos:8765
                                                          └── cookie-session login
```

## Data layout (inside the `./data` volume)
| Path | What |
|------|------|
| `kiros.db` | users, sessions, password-reset tokens (SQLite) |
| `users/<uid>/KIROS.md` | that user's board |
| `users/<uid>/{descriptions.json,completions.jsonl,prefs.json}` | notes, history, UI prefs |
| `users/<uid>/icons/` | uploaded company icons |

## One-time migration: existing single-user prod → multi-user

The current container serves one board from `data/KIROS.md`. The migration creates
`kiros.db`, an **admin** account, and moves that board into `users/<uid>/`. It's idempotent
and reversible (you keep a backup). Run it on the VPS, where `docker-compose.yml` lives:

```bash
cd ~/kiros            # wherever the kairos compose + data/ live

# 1. BACK UP the data volume — your safety net.
cp -a data "data.bak-$(date +%Y%m%d-%H%M%S)"

# 2. Get the multi-user code (branch feat/multi-user).
git fetch origin && git checkout feat/multi-user && git pull
#    (no git checkout here? rsync the repo from your Mac, excluding data/ and .env)

# 3. Build the multi-user image.
docker compose build

# 4. Convert ./data in place. Admin email defaults to philipp.solay@gmail.com;
#    admin PASSWORD = your existing .env KIROS_AUTH_PASS (compose passes .env in).
docker compose run --rm -e SOURCE_DATA=/data kairos python3 migrate_to_multiuser.py
#    -> "created admin philipp.solay@gmail.com (<uid>) ... moved KIROS.md -> users/<uid>/KIROS.md"

# 5. Swap the running container to the multi-user image.
docker compose up -d

# 6. Watch it come up.
docker compose logs -f kairos        # "serving on 0.0.0.0:8765"
```

## Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/login   # 200 (login page)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/        # 303 -> /login
```
Then open **https://kairos.solay.cloud** → you should see the **login page** (not a
Basic-Auth popup). Sign in as `philipp.solay@gmail.com` with your `KIROS_AUTH_PASS`. Your
full board + Stats history are there. Friends can now self-serve **Sign up** (the first
account — yours — is already the admin).

## Rollback (back to single-user)
```bash
cd ~/kiros
docker compose down
rm -rf data && mv data.bak-<stamp> data      # restore the pre-migration board
git checkout main && docker compose up -d --build
```

## Notes / gotchas
- **Never set `KIROS_DEV`** in `.env` or compose on prod — it drops the Secure cookie flag.
- `.env`'s `KIROS_AUTH_USER`/`KIROS_AUTH_PASS` are **legacy**: only the migration reads
  `KIROS_AUTH_PASS` (as the new admin password). The running app ignores them.
- Traefik routing, the `proxy` network, the cert resolver, and port **8765** are unchanged —
  no proxy or DNS edits needed.
- The `/u/<token>/kiros.ics` calendar feed is now **per-user, token-based** (no creds in the
  URL). Grab the new feed URL from the app after signing in.
- Zero-risk alternative: deploy a second container on a test host (e.g. a `kairos2.solay.cloud`
  Traefik router) against a **copy** of `data/`, verify, then cut `kairos.solay.cloud` over.

## Updating later
```bash
cd ~/kiros && git pull && docker compose up -d --build
```

## Backups
Back up the whole `data/` dir (`kiros.db` + `users/`). The container and image are disposable.
