# ============================================================
# VEXORA (فيكسورا) — bulletproof production image
# ALL dependencies ship pre-built inside the repo (prebuilt/):
# the build is pure COPY — no npm, no network, no compilation.
# Works identically on Render / Railway / Fly / VPS.
# ============================================================
FROM node:20-slim

ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/vexora.db

WORKDIR /app
COPY prebuilt/node_modules ./node_modules
COPY server ./server
COPY public ./public
COPY package.json ./

RUN useradd -m -u 1000 user \
 && mkdir -p /app/data \
 && chown -R user:user /app
USER user

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
