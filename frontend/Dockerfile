# Frontend: React (Vite) + nginx
# Build: docker build -t ai-synthesis-frontend frontend
# Run:  docker run -p 8022:80 -e API_BACKEND_URL=http://backend:8021 ai-synthesis-frontend
# With compose, API_BACKEND_URL defaults to http://backend:8021

# Stage 1: build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine

RUN apk add --no-cache gettext

# Remove default config and copy our config (proxies /api to backend)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Substitute API_BACKEND_URL at runtime via envsubst (default for compose)
ENV API_BACKEND_URL=http://backend:8021

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Replace placeholder in nginx config with env and start nginx
CMD ["/bin/sh", "-c", "envsubst '${API_BACKEND_URL}' < /etc/nginx/conf.d/default.conf > /tmp/default.conf && mv /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
