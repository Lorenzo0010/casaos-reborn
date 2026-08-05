# Stage 1: Build the React Frontend
# Use native platform for frontend to avoid QEMU emulation overhead and crashes
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup the Node.js Backend
# Use Debian (bookworm-slim) instead of Alpine to fix Node 20 + QEMU "Illegal instruction" crashes on ARM64
FROM node:20-bookworm-slim
WORKDIR /app/backend

# Install necessary system packages for node-pty and general utilities, plus Docker CLI and Compose
RUN apt-get update && apt-get install -y --no-install-recommends \
    make gcc g++ python3 bash procps util-linux openssh-client curl ca-certificates gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./
# Copy built frontend assets to be served by the backend
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000
CMD ["node", "server.js"]
