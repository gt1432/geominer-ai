# Use official Node.js runtime as parent image
FROM node:20-slim

# Install system dependencies, python3, and virtual environment
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside container
WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js modules
RUN npm ci

# Create Python virtual environment and install dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy all application files
COPY . .

# Set container configurations
ENV PORT=3000
ENV PYTHON_PATH=/opt/venv/bin/python
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start Express server
CMD ["node", "backend/server.js"]
