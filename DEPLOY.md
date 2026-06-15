# Deploying Kiros — kairos.solay.cloud

Kiros is a stdlib-only Python app (no build step). It runs in one small container,
keeps all data in a mounted `data/` volume, and is protected by **HTTP Basic Auth
inside the app** (so it's safe even if the proxy is misconfigured). A reverse proxy
you already run on the VPS terminates TLS and forwards to it.

```
internet ──TLS──▶ your reverse proxy (kairos.solay.cloud) ──http──▶ 127.0.0.1:8765 (kiros container)
                                                                     └── Basic Auth enforced here
```

## 0. Prerequisites
- Docker + Docker Compose on the `kiros` VPS.
- DNS: an **A record** `kairos.solay.cloud → <VPS public IP>` (AAAA too if you use IPv6).
- Your existing reverse proxy (nginx / Traefik / Nginx-Proxy-Manager) running on the VPS.

## 1. Get the code + data onto the VPS
```bash
ssh you@kiros
mkdir -p ~/kiros && cd ~/kiros
# copy the repo here (git clone, or rsync from your Mac):
#   rsync -av --exclude data --exclude .env /Users/philippsolay/code/Kiros/ you@kiros:~/kiros/
```

Put your real board + history in the data volume:
```bash
mkdir -p data
# from your Mac, copy the live files into the VPS data dir:
#   scp KIROS.md descriptions.json completions.jsonl you@kiros:~/kiros/data/   # (whichever exist)
```
If `data/KIROS.md` is missing on first boot, Kiros writes a minimal starter so it
doesn't crash — replace it with your real board and restart.

## 2. Set the auth credentials
```bash
cp .env.example .env
# generate a strong password and edit .env:
openssl rand -base64 24
nano .env            # set KIROS_AUTH_USER and KIROS_AUTH_PASS
```

## 3. Start it
```bash
docker compose up -d --build
docker compose logs -f kiros        # should say: listening on 0.0.0.0:8765
```
Verify locally on the VPS (401 without creds, 200 with):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/            # 401
curl -s -o /dev/null -w "%{http_code}\n" -u "$KIROS_AUTH_USER:$KIROS_AUTH_PASS" http://127.0.0.1:8765/   # 200
```

## 4. Point your reverse proxy at it

### nginx (host-installed)
`/etc/nginx/sites-available/kairos.solay.cloud`:
```nginx
server {
    listen 80;
    server_name kairos.solay.cloud;
    location / {
        proxy_pass http://127.0.0.1:8765;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
ln -s /etc/nginx/sites-available/kairos.solay.cloud /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d kairos.solay.cloud      # provisions + auto-renews TLS
```
> Auth is already enforced by the app — don't add nginx `auth_basic` too (you'd get a double prompt). Add it only if you want belt-and-suspenders.

### Traefik (labels)
Add to the `kiros` service in `docker-compose.yml` and attach it to your Traefik network:
```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kiros.rule=Host(`kairos.solay.cloud`)"
      - "traefik.http.routers.kiros.entrypoints=websecure"
      - "traefik.http.routers.kiros.tls.certresolver=le"
      - "traefik.http.services.kiros.loadbalancer.server.port=8765"
```
Then **remove the `ports:` block** (Traefik reaches it over the shared Docker network) and add that network.

### Nginx-Proxy-Manager / any containerized proxy
The `127.0.0.1:8765` host binding is **not** reachable from another container.
Either: (a) remove the `ports:` block and put `kiros` on the proxy's Docker network,
then point the proxy at `http://kiros:8765`; or (b) change the binding to the
docker bridge IP. Forward host `kairos.solay.cloud → kiros:8765`, enable SSL (Let's Encrypt).

## 5. Calendar feed (optional)
The `/kiros.ics` feed is behind the same auth. Subscribe with credentials in the URL:
```
webcal://philipp:PASSWORD@kairos.solay.cloud/kiros.ics
```

## Updating
```bash
cd ~/kiros && git pull        # or rsync the changed files
docker compose up -d --build
```

## Backups
Everything that matters is in `data/` (`KIROS.md`, `descriptions.json`, `completions.jsonl`).
Back that directory up; the container and image are disposable.

## Env reference
| Var | Default | Notes |
|-----|---------|-------|
| `KIROS_AUTH_USER` / `KIROS_AUTH_PASS` | — | Both required to enable auth. **Set them.** |
| `KIROS_DATA` | `/data` | Where the board + sidecars live. |
| `KIROS_HOST` | `0.0.0.0` (in image) | Bind address inside the container. |
| `KIROS_PORT` | `8765` | Port inside the container. |
