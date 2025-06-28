# Use Node.js 20 as base image
FROM node:20-slim

# Install dependencies for bun
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add bun to PATH
ENV PATH="/root/.bun/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies for build)
RUN bun install

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