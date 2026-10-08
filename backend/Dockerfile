FROM node:22-alpine
WORKDIR /srv
COPY shared ./shared
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /srv/backend
RUN npm ci
COPY backend ./
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
