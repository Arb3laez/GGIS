# syntax=docker/dockerfile:1
# Monolito: una sola imagen; el backend (Node) sirve la API y también el front compilado.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY backend/domain/package.json backend/domain/
COPY front/package.json front/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    API_PORT=4000 \
    DATA_DIR=/data \
    NODE_NO_WARNINGS=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY backend/domain/package.json backend/domain/
COPY front/package.json front/
RUN npm ci --omit=dev -w @ggis/backend && npm cache clean --force \
  && mkdir -p /data && chown node:node /data
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/front/dist front/dist
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "backend/dist/main.js"]
