# Multi-stage build for Google Cloud MCP Server
FROM node:22-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
COPY . .
CMD ["pnpm", "dev"]

# Build stage
FROM base AS build

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

# Add labels for better container management
LABEL org.opencontainers.image.title="Google Cloud MCP Server"
LABEL org.opencontainers.image.description="Model Context Protocol server for Google Cloud services"
LABEL org.opencontainers.image.version="0.4.0"
LABEL org.opencontainers.image.authors="Kristof Kowalski <k@ko.wal.ski>"
LABEL org.opencontainers.image.source="https://github.com/krzko/google-cloud-mcp"
LABEL org.opencontainers.image.licenses="Apache"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodejs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install only production dependencies
RUN npm install -g pnpm@9.15.4 && \
    pnpm install --prod --frozen-lockfile && \
    pnpm store prune && \
    npm uninstall -g pnpm && \
    rm -rf /root/.npm /root/.pnpm-store ./pnpm-lock.yaml

# Switch to non-root user
USER nodejs

# Expose port (though MCP uses stdio, this is for future extensions)
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Default command
CMD ["node", "dist/index.js"]
