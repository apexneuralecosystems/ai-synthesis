# Frontend: React (Vite) — static build served on 8022 (no nginx).
# Set VITE_API_BASE_URL at build time if API is on another host (e.g. https://backend.example.com/api).
# Run: docker run -p 8022:8022 ai-synthesis-frontend

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Stage 2: serve static files with Node (serve)
FROM node:22-alpine

RUN npm install -g serve

COPY --from=builder /app/dist /app/dist

WORKDIR /app

EXPOSE 8022

CMD ["serve", "-s", "dist", "-l", "8022"]
