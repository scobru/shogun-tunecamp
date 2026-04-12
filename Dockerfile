# ===================================================
# TuneCamp Docker Image
# Multi-stage build for production deployment
# ===================================================

ARG TUNECAMP_PUBLIC_URL
ARG TUNECAMP_GUN_PEERS 
ARG TUNECAMP_RELAY_URL
ARG VITE_GUN_PEERS
ARG RELAY_CACHE_BUST
ARG TUNECAMP_RPC_URL
ARG TUNECAMP_OWNER_ADDRESS
ARG TUNECAMP_CURRENCY_CONTRACT
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR

# CapRover passes this on deploy; using it invalidates cache per commit
ARG CAPROVER_GIT_COMMIT_SHA

# Build stage
FROM node:22-alpine AS builder

# Re-declare ARGs needed in this stage (multi-stage build)
ARG CAPROVER_GIT_COMMIT_SHA
ARG TUNECAMP_PUBLIC_URL
ARG TUNECAMP_RPC_URL
ARG TUNECAMP_OWNER_ADDRESS
ARG TUNECAMP_CURRENCY_CONTRACT
ARG VITE_GUN_PEERS
ARG TUNECAMP_ADMIN_USER
ARG TUNECAMP_ADMIN_PASS
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR
ARG NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

# Consume build-args (avoids unconsumed build-arg warnings; SHA also busts cache per deploy)
RUN echo "CapRover commit: ${CAPROVER_GIT_COMMIT_SHA:-none}" && \
    echo "Tunecamp URL: ${TUNECAMP_PUBLIC_URL:-unset}" && \
    echo "Relay cache bust: ${RELAY_CACHE_BUST:-unset}"

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ curl git libc6-compat gcompat


# Copy package files
COPY package*.json ./


# Puppeteer configuration to skip Chrome download
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .



# Build TypeScript
RUN npm run build

# Pass ARGs to VITE_ ENVs for frontend build
ENV VITE_TUNECAMP_OWNER_ADDRESS=$TUNECAMP_OWNER_ADDRESS
ENV VITE_TUNECAMP_RPC_URL=$TUNECAMP_RPC_URL
ENV VITE_TUNECAMP_CURRENCY_CONTRACT=$TUNECAMP_CURRENCY_CONTRACT
ENV VITE_GUN_PEERS=$VITE_GUN_PEERS

# Build Frontend
RUN cd webapp && npm install && npm run build
# Ensure all public assets (manifest, sw, icons) are in dist
RUN cp -v webapp/public/manifest.json webapp/dist/ 2>/dev/null || true
RUN cp -v webapp/public/sw.js webapp/dist/ 2>/dev/null || true
RUN cp -rv webapp/public/* webapp/dist/ 2>/dev/null || true

# ===================================================
# Production stage
# ===================================================
FROM node:22-alpine

# Re-declare ARG so production stage gets fresh value; busts cache so new code is always copied
ARG CAPROVER_GIT_COMMIT_SHA

WORKDIR /app

# Cache buster: forces this stage to rebuild every deploy (no "Using cache" on COPY --from=builder)
RUN echo "Production deploy commit: ${CAPROVER_GIT_COMMIT_SHA:-none}"

# Install runtime dependencies for native modules and Puppeteer/Chrome
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    gcompat \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev

# Puppeteer configuration for Alpine
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    apk del python3 make g++ && \
    rm -rf /root/.npm

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/webapp/dist ./webapp/dist
COPY --from=builder /app/webapp/public ./webapp/public


# Create directories for data persistence
RUN mkdir -p /music /data /radata

# Re-declare ARGs for production stage
ARG TUNECAMP_ADMIN_USER
ARG TUNECAMP_ADMIN_PASS
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR
ARG NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"

# Environment variables
ENV NODE_ENV=production
ENV TUNECAMP_DB_PATH=/data/tunecamp.db
ENV RADATA_PATH=/radata
ENV TUNECAMP_ADMIN_USER=$TUNECAMP_ADMIN_USER
ENV TUNECAMP_ADMIN_PASS=$TUNECAMP_ADMIN_PASS
ENV DISCOGS_TOKEN=$DISCOGS_TOKEN
ENV TUNECAMP_DOWNLOAD_DIR=$TUNECAMP_DOWNLOAD_DIR
ENV NODE_OPTIONS=$NODE_OPTIONS
ENV COINBASE_CDP_API_KEY_NAME=""
ENV COINBASE_CDP_API_KEY_SECRET=""


# Expose default port
EXPOSE 1970

# Install runtime dependencies
RUN apk add --no-cache curl libc6-compat gcompat

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:1970/api/catalog || exit 1

# Default command: run migrations then start server
CMD node dist/tools/migrate-dedupe.js --music-dir /music --db /data/tunecamp.db && node dist/tools/migrate-visibility.js --db /data/tunecamp.db && node dist/cli.js server /music --port 1970 --db /data/tunecamp.db
