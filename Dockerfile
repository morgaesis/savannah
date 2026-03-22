FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g bun
COPY public ./public
RUN bun build public/engine.js --outfile dist/engine.js --minify 2>/dev/null || cp public/engine.js dist/
RUN cp public/index.html public/favicon.svg public/og.png public/sw.js public/manifest.json dist/

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
