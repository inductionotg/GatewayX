FROM node:22-bookworm-slim

# Prisma's Linux engine requires OpenSSL. Never copy Windows node_modules.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY gateway/package.json ./gateway/package.json
COPY services/product-service/package.json ./services/product-service/package.json
COPY services/review-service/package.json ./services/review-service/package.json
COPY services/user-service/package.json ./services/user-service/package.json

# Retain the Prisma CLI so this image can also run deployment migrations.
RUN npm ci --workspace=services/review-service --include-workspace-root=false \
    --ignore-scripts --no-audit --no-fund

COPY --chown=node:node services/review-service/ ./services/review-service/
WORKDIR /app/services/review-service

# Client generation needs config values but does not connect to a database.
# These placeholders contain no credentials from the local development setup.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SHADOW_DATABASE_URL=postgresql://build:build@localhost:5432/build_shadow \
    npx prisma generate

ENV NODE_ENV=production
ENV PORT=3003
USER node
EXPOSE 3003
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
