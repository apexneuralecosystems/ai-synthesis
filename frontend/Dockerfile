# Frontend: React (Vite) — static build served on 8022.
# IMPORTANT:
# - Backend base URL is injected at build time via VITE_API_BASE_URL.
# - Pass it with --build-arg VITE_API_BASE_URL=https://backend.apexneurallabs.com/api
#   so the compiled bundle talks to the correct API.
# Run example:
#   docker build -t ai-synthesis-frontend \
#     --build-arg VITE_API_BASE_URL=https://backend.apexneurallabs.com/api \
#     -f frontend/Dockerfile frontend
#   docker run -p 8022:8022 ai-synthesis-frontend

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# Inject backend API base URL for Vite at build time.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN echo "Building frontend with VITE_API_BASE_URL='${VITE_API_BASE_URL:-/api}'" && \
    npm run build

# Stage 2: serve static files with Node (serve)
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist /app/dist

# Carry over the API base URL into the runtime environment for logging visibility.
ARG VITE_API_BASE_URL
ENV FRONTEND_API_BASE_URL=${VITE_API_BASE_URL}

EXPOSE 8022

# Log which backend URL this image was built against, then start the static server.
CMD sh -c 'echo \"Starting frontend on :8022 (API base: ${FRONTEND_API_BASE_URL:-/api})\" >&2 && serve -s dist -l 8022'
