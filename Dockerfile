FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3013 HOST=0.0.0.0 DATA_DIR=/data
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/build-platform ./build-platform
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/platform/sandboxCore.js ./src/platform/sandboxCore.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3013
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3013/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/app.cjs"]
