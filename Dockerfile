# ─── Stage 1: Build ───────────────────────────────────────────────
FROM node:20-slim AS builder

# Install Python3 + pip + venv system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies first (leverages Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Create Python venv and install ML dependencies
COPY requirements.txt ./
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip --quiet && \
    pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: Production Image ────────────────────────────────────
FROM node:20-slim

# Install Python3 runtime (no pip needed in final stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Node modules and Python venv from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /opt/venv /opt/venv

# Copy application source
COPY . .

# Environment configuration
ENV PORT=3000
ENV NODE_ENV=production
ENV PYTHON_PATH=/opt/venv/bin/python3

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start Express server
CMD ["node", "backend/server.js"]
