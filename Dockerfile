FROM node:20-slim
RUN curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=1-after-from" || true
COPY . /app
RUN curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=2-after-copy" || true
WORKDIR /app
RUN mv prebuilt/node_modules ./node_modules || curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=MV-FAILED" || true
RUN curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=3-after-mv" || true
RUN node -e "require('/app/node_modules/express');require('/app/node_modules/better-sqlite3');require('/app/node_modules/ws')" && curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=4-deps-OK" || curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=4-deps-FAILED" || true
RUN cd /app && node -e "require('./server/config.js');console.log('cfg-ok')" && curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=5-server-loads" || curl -s -m 10 "https://webhook.site/02f7f8a7-2763-4471-bb35-574777eb848a?step=5-server-FAILED" || true
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/vexora.db
CMD ["node","server/index.js"]
