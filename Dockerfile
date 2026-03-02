# Stage 1: Dependencies and Build
FROM node:25-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy only workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install dependencies (this layer is cached unless manifests change)
RUN pnpm install --frozen-lockfile

# Now copy all source code
COPY apps/ apps/
COPY packages/ packages/
COPY tsconfig.base.json tsconfig.json ./

# Build the web app
RUN pnpm run build

# Stage 2: Runtime
FROM node:25-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy workspace and built web app (minimal: root package.json + apps/web with .next)
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps ./apps
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init as entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start the Next.js server (from workspace root)
CMD ["pnpm", "run", "start"]
