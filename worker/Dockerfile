FROM node:25-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends qpdf libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress fonts-liberation fonts-dejavu-core tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
ENV NODE_ENV=production PORT=8080 HOME=/tmp
EXPOSE 8080
USER 65532:65532
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.mjs"]
