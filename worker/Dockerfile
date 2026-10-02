FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm qpdf libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
CMD ["node","server.mjs"]