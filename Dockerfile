FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild sqlite3 \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn*

COPY --chown=node:node server.js config.js db.js ./
COPY --chown=node:node routes ./routes
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public

RUN mkdir -p data public/uploads && chown -R node:node data public/uploads

USER node
EXPOSE 3000
CMD ["node", "server.js"]