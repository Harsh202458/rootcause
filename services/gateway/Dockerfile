# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# We need the workspace root files to install workspaces properly
COPY package.json tsconfig.base.json ./
COPY services/gateway/package.json ./services/gateway/

# Install dependencies if in a workspace
RUN npm install --workspaces --if-present || npm install

COPY services/gateway/src ./services/gateway/src
COPY services/gateway/tsconfig.json ./services/gateway/

WORKDIR /app/services/gateway
RUN npx tsc

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/gateway/package.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
