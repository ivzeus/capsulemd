# --- Stage 1: build the React frontend ---
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: runtime image ---
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# python3/pip for yt-dlp, ffmpeg for merging/converting media, nodejs for the server
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp via pip — kept current independent of apt's lagging repo version
# RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp
# use the nightly pre-release version of yt-dlp to get the latest features and fixes, but this may be less stable
RUN pip3 install --no-cache-dir --break-system-packages -U --pre yt-dlp

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

# Mounted volumes: downloaded files + persisted JSON state
RUN mkdir -p /downloads /app/server/data
VOLUME ["/downloads", "/app/server/data"]

EXPOSE 3001

CMD ["node", "server/index.js"]
