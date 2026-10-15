FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server ./server
COPY ops/validate-netcup-sandbox.py /app/sandbox/validate-netcup-sandbox.py
EXPOSE 3000
CMD ["sh", "-c", "python3 /app/sandbox/validate-netcup-sandbox.py --runtime && exec node server/pos-license-sandbox-start.js"]
