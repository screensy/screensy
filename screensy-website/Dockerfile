FROM node:14.16-alpine3.13 AS builder

WORKDIR /home/node/app

COPY tsconfig.json ./
COPY screensy.ts ./

RUN npm install typescript@4.2.3 -g
RUN tsc

FROM golang:1.15

WORKDIR /go/src/app

COPY --from=builder /home/node/app/screensy.js ./
COPY --from=builder /home/node/app/screensy.js.map ./
COPY --from=builder /home/node/app/screensy.ts ./

COPY index.html ./
COPY styles.css ./
COPY main.go ./
COPY go.mod ./

RUN go get ./...

CMD ["go", "run", "main.go"]
