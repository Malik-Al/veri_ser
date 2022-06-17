FROM node:14-slim


RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package*.json ./

COPY . .

ENV http_proxy http://roman.zavyazkin:120898Veronika1@192.168.11.251:3128/
ENV https_proxy http://roman.zavyazkin:120898Veronika1@192.168.11.251:3128/
ENV http.sslVerify false

RUN npm config set strict-ssl false

RUN npm install

RUN npm config set strict-ssl true


CMD [ "npm", "start" ]