FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

# Must match default in src/server.js (PORT || 5000). Override at runtime: docker run -e PORT=3000 ...
ENV PORT=5000
EXPOSE 5000

CMD ["npm", "start"]

