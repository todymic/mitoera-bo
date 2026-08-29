# syntax=docker/dockerfile:1

##### Stage 1: Build Vite/Vue app #####
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE=https://api.mitoera.com
ARG VITE_MERCURE_URL=https://api.mitoera.com/.well-known/mercure
ARG VITE_FIREBASE_API_KEY=AIzaSyBgzWlRvvEUlX_AyBQtuDPwblDMVf8WyJI
ARG VITE_FIREBASE_AUTH_DOMAIN=mitoera-b9471.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=mitoera-b9471
ARG VITE_FIREBASE_STORAGE_BUCKET=mitoera-b9471.firebasestorage.app
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=309406690936
ARG VITE_FIREBASE_APP_ID=1:309406690936:web:c9e392c55261dca6e0478d

ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_MERCURE_URL=$VITE_MERCURE_URL
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN npm run build

##### Stage 2: nginx pour servir les fichiers statiques #####
FROM nginx:alpine AS app

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
    CMD pgrep nginx > /dev/null || exit 1

EXPOSE 80
