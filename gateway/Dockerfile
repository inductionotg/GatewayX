FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY gateway/package.json ./gateway/package.json
COPY services/product-service/package.json ./services/product-service/package.json
COPY services/review-service/package.json ./services/review-service/package.json
COPY services/user-service/package.json ./services/user-service/package.json
RUN npm ci --workspace=gateway --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node gateway/src/ ./gateway/src/
WORKDIR /app/gateway
ENV NODE_ENV=production
ENV PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
