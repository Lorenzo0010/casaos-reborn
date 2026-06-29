# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup the Node.js Backend
FROM node:20-alpine
WORKDIR /app/backend

# Install necessary system packages for node-pty and general utilities
RUN apk add --no-cache make gcc g++ python3 bash procps util-linux

COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./
# Copy built frontend assets to be served by the backend
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000
CMD ["node", "server.js"]
