FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PACK=/app/packs/frontier
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist dist
COPY packs/frontier packs/frontier
COPY OGL.md LICENSE ./
COPY docs/licensing.md docs/licensing.md
COPY guard/denylist.sha256 guard/denylist.sha256
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/main.js"]
