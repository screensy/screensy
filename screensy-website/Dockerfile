FROM node:14.16-alpine3.13 AS builder

WORKDIR /home/node/app

COPY tsconfig.json ./
COPY screensy.ts ./

RUN npm install typescript -g
RUN tsc

FROM caddy:2.3.0-alpine

WORKDIR /usr/share/caddy

COPY --from=builder /home/node/app/screensy.js ./
COPY --from=builder /home/node/app/screensy.js.map ./
COPY --from=builder /home/node/app/screensy.ts ./

COPY index.html ./
COPY styles.css ./
