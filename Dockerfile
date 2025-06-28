# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build with Bun's bundler (超高速!)
RUN bun build src/server.ts --target=bun --outdir=dist

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 8080

# Set environment variable
ENV PORT=8080

# Start with Bun runtime
CMD ["bun", "run", "dist/server.js"]