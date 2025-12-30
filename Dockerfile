# Use official Node.js LTS image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Cloud Run listens on $PORT
ENV PORT=8080

# Start server
CMD ["node", "server.js"]
