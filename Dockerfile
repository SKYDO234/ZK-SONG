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
# The API itself lives in api/ (shared with the Vercel/Netlify functions)
COPY api ./api
# Uploaded media + SQLite database live on a mounted volume
RUN mkdir -p /data /app/server/uploads/audio /app/server/uploads/thumbnails \
    /app/server/uploads/videos /app/server/uploads/avatars /app/server/uploads/branding \
    && chown -R node:node /data /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "server/index.js"]
