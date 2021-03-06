FROM 15.11-alpine3.13

WORKDIR /home/node/app

COPY package.json ./
COPY server.ts ./

RUN npm install
USER node

RUN npm run build

CMD ["npm", "start"]

EXPOSE 4000
