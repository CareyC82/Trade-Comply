FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    CONSUMER_HOST=0.0.0.0 \
    CONSUMER_PORT=8790 \
    CONSUMER_DATA_DIR=/var/lib/tracewize-consumer

RUN mkdir -p /var/lib/tracewize-consumer && chown -R node:node /app /var/lib/tracewize-consumer
USER node
EXPOSE 8790
VOLUME ["/var/lib/tracewize-consumer"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8790/api/consumer/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/consumer-server.js"]
