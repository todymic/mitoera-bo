# syntax=docker/dockerfile:1

##### Stage 1: Build Vite/Vue app #####
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

ARG VITE_API_BASE=https://api.mitoera.com
ARG VITE_MERCURE_URL=https://api.mitoera.com/.well-known/mercure
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_MERCURE_URL=$VITE_MERCURE_URL

RUN npm run build

##### Stage 2: nginx pour servir les fichiers statiques #####
FROM nginx:alpine AS app

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
