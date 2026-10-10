# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# We need the workspace root files to install workspaces properly
COPY package.json tsconfig.base.json ./
COPY services/payments/package.json ./services/payments/

# Install dependencies if in a workspace
RUN npm install --workspaces --if-present || npm install

COPY services/payments/src ./services/payments/src
COPY services/payments/tsconfig.json ./services/payments/

WORKDIR /app/services/payments
RUN npx tsc

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/services/payments/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/payments/package.json ./

EXPOSE 3003

CMD ["node", "dist/index.js"]
