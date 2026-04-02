FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json .
RUN npm install --production

# Copy server
COPY server.js .

# Volume untuk data persistensi
VOLUME ["/data"]

EXPOSE 3001

CMD ["node", "server.js"]
