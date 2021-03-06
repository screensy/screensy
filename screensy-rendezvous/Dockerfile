FROM node:14.16-alpine3.13

WORKDIR /home/node/app

COPY package.json ./
COPY tsconfig.json ./
COPY server.ts ./

RUN npm install
RUN npm run build

USER node

CMD ["npm", "start"]

EXPOSE 4000
