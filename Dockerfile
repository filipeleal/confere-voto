FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY vendor ./vendor

RUN ln -s /home/confere-voto-data /app/data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PYTHON=/opt/venv/bin/python \
    OFFICE_DB_PATH=/tmp/offices.sqlite

EXPOSE 3000

CMD ["sh", "-c", "mkdir -p /home/confere-voto-data && exec node server.mjs"]
