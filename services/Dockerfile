# One image for every service; the SERVICE env var picks which one runs.
FROM node:20-alpine AS build
WORKDIR /app
COPY services/package.json ./
RUN npm install --no-audit --no-fund
COPY services/tsconfig.json ./
COPY services/src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-alpine
WORKDIR /app
COPY services/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
