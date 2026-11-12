# ============================================================================
# ZK-SONG — single-image deployment (API + built frontend)
# Works on Render, Railway, Fly.io, Koyeb, DigitalOcean App Platform, any VPS.
# ============================================================================
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
# Uploaded media + SQLite database live on a mounted volume
RUN mkdir -p /data /app/server/uploads/audio /app/server/uploads/thumbnails \
    /app/server/uploads/videos /app/server/uploads/avatars /app/server/uploads/branding
EXPOSE 4000
CMD ["node", "--no-warnings", "server/index.js"]
