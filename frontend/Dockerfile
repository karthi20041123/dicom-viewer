# D:\Dicom-Viewer\dicom-viewer\frontend\Dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3030
CMD ["npm", "run", "preview"]