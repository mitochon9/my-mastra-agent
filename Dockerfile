# Use Node.js 20 as base image
FROM node:20-slim

# Install bun
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://bun.sh/install | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --production

# Copy TypeScript config and source files
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN bun run build

# Expose port
EXPOSE 8080

# Set environment variable for Google Cloud Run
ENV PORT=8080

# Start the application
CMD ["node", "dist/server.js"]