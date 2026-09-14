FROM node:20-alpine

WORKDIR /app
ENV PORT=8080

COPY dist ./dist
COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
