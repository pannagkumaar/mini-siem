# Production build Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY frontend/react-ui/package*.json ./
RUN npm install

COPY frontend/react-ui/src ./src
COPY frontend/react-ui/index.html ./
COPY frontend/react-ui/vite.config.js ./
COPY frontend/react-ui/postcss.config.js ./
COPY frontend/react-ui/tailwind.config.js ./
RUN npm run build

# Stage 2: Serve built app
FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
