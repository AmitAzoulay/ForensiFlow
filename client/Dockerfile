FROM node:24-alpine AS builder
WORKDIR /app

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
COPY .env.client .

RUN set -a && \
    . ./.env.client && \
    set +a && \
    npm run build

FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
