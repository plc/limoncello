FROM node:20-alpine

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

# Data directory for SQLite (mount as volume)
RUN mkdir -p /app/data

EXPOSE 3654

CMD ["node", "src/index.js"]
