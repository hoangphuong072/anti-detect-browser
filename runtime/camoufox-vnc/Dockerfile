FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV NOVNC_PORT=6080
ENV VNC_PORT=5900
ENV HOME=/home/camoufox
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox-browser

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fluxbox \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libdbus-glib-1-2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    net-tools \
    novnc \
    python3 \
    python3-pip \
    websockify \
    x11vnc \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash camoufox
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

WORKDIR /opt/camoufox-runner
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY start.js ./
RUN npx camoufox-js fetch
RUN chown -R camoufox:camoufox /opt/camoufox-runner /opt/camoufox-browser \
  && chmod 755 /opt/camoufox-runner \
  && chmod 644 /opt/camoufox-runner/start.js

USER camoufox
RUN mkdir -p /home/camoufox/profile /home/camoufox/tmp

EXPOSE 6080
CMD ["node", "/opt/camoufox-runner/start.js"]
