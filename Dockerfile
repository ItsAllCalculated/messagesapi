# Use an official Node runtime
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install only dependencies first (faster builds)
COPY package*.json ./
RUN npm install --production

# Copy the rest of the source
COPY . .

# Cloud Run will set PORT — do NOT hardcode it
ENV PORT=8080

# Cloud Run needs this line so it knows what port you expose
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
