# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# We need the workspace root files to install workspaces properly
COPY package.json tsconfig.base.json ./
COPY services/orders/package.json ./services/orders/

# Install dependencies if in a workspace
RUN npm install --workspaces --if-present || npm install

COPY services/orders/src ./services/orders/src
COPY services/orders/tsconfig.json ./services/orders/

WORKDIR /app/services/orders
RUN npx tsc

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/services/orders/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/orders/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
