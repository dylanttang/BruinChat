FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY models models
COPY server server
WORKDIR /app/server
ENV NODE_ENV=production
CMD ["npm", "start"]
