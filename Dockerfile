FROM node:26-alpine

RUN apk add --no-cache bash tini

EXPOSE 3000

COPY . /frontend

WORKDIR /frontend

RUN npm --loglevel info install .

ENTRYPOINT [ "tini", "--", "/frontend/entrypoint.sh"]
