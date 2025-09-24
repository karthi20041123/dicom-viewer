# Use Node.js 18 LTS
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json & package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose backend port
EXPOSE 5000

# Start backend
CMD ["node", "server.js"]
