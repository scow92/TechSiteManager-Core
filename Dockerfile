FROM node:24-slim AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN mkdir -p /app/runtime-data && chown 65532:65532 /app/runtime-data

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:774b7d020b24214835769e24c3544835526cd0288f0b094eae48e8b2c2429a79 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PROXY_MODE=direct \
    SECURE_TRANSPORT=false \
    DATA_DIR=/app/data
WORKDIR /app
COPY --from=dependencies --chown=65532:65532 /app/runtime-data ./data
COPY --from=dependencies --chown=65532:65532 /app/node_modules ./node_modules
COPY --chown=65532:65532 package.json ./package.json
COPY --chown=65532:65532 LICENSE COPYRIGHT.md ./
COPY --chown=65532:65532 server ./server
COPY --chown=65532:65532 public ./public
EXPOSE 3000
USER nonroot
CMD ["server/server.js"]
