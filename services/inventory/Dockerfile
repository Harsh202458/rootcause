# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# We need the workspace root files to install workspaces properly
COPY package.json tsconfig.base.json ./
COPY services/inventory/package.json ./services/inventory/

# Install dependencies if in a workspace
RUN npm install --workspaces --if-present || npm install

COPY services/inventory/src ./services/inventory/src
COPY services/inventory/tsconfig.json ./services/inventory/

WORKDIR /app/services/inventory
RUN npx tsc

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/services/inventory/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/inventory/package.json ./

EXPOSE 3002

CMD ["node", "dist/index.js"]
