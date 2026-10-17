FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server ./server
COPY --chown=node:node db ./db
COPY --chown=node:node apps/web/public ./apps/web/public
USER node
ENV NODE_ENV=development
EXPOSE 3000
CMD ["node", "server/preview-start.js"]
