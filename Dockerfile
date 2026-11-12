FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.js config.js db.js ./
COPY --chown=node:node routes ./routes
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public

RUN mkdir -p data public/uploads && chown -R node:node data public/uploads

USER node
EXPOSE 3000
CMD ["node", "server.js"]