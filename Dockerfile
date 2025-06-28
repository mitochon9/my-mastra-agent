# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./

# Install all dependencies (cached unless package files change)
RUN bun install --frozen-lockfile

# Copy config files next (less frequently changed)
COPY tsconfig.json bunfig.toml ./

# Copy source files last (most frequently changed)
COPY src ./src

# Build with Bun's bundler - single file output for smaller image
RUN mkdir -p dist && bun build src/server.ts \
    --target=bun \
    --outfile=dist/server.js \
    --minify \
    --sourcemap

# Production stage - use distroless for smaller size
FROM oven/bun:1-distroless

WORKDIR /app

# Copy the entire dist directory
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 8080

# Set environment variable
ENV PORT=8080

# Start with Bun runtime
ENTRYPOINT ["bun", "run", "dist/server.js"]