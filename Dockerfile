# Kiros (multi-user) — stdlib-only Python app, no build step, no third-party deps.
FROM python:3.12-slim

WORKDIR /app

# App code. Identity DB (kiros.db) + per-user boards live in the mounted volume at /data.
# migrate_to_multiuser.py is shipped so a single-user /data can be converted in-place.
COPY kiros.py kiros_web.py auth.py store.py migrate_to_multiuser.py ./
COPY web ./web

ENV KIROS_HOST=0.0.0.0 \
    KIROS_PORT=8765 \
    KIROS_DATA=/data \
    KIROS_NO_OPEN=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8765
VOLUME ["/data"]

# "Up" = the port accepts connections (works even with auth on).
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD python3 -c "import socket,sys; s=socket.socket(); sys.exit(s.connect_ex(('127.0.0.1',8765)))"

CMD ["python3", "kiros_web.py", "--no-open"]
