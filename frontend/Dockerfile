# Use Node.js 18 LTS
FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Build React app
RUN npm run build

# Install serve to run build
RUN npm install -g serve

# Expose frontend port
EXPOSE 5173

# Serve the build
CMD ["serve", "-s", "build", "-l", "3030"]
