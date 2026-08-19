FROM node:20-slim
COPY . /app
WORKDIR /app
RUN mv prebuilt/node_modules ./node_modules
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/vexora.db
CMD ["node","server/index.js"]
