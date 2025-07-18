# Etapa 1: build
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
COPY src ./src
COPY tsconfig.json ./
COPY .env.example .env.example

RUN npm install
RUN npm run build

# Etapa 2: imagem final enxuta
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.env.example ./.env.example
RUN npm install --omit=dev

CMD ["node", "dist/index.js"]
