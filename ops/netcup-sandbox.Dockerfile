FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server ./server
COPY apps/web ./apps/web
COPY db ./db
EXPOSE 3000
CMD ["npm", "start"]
