FROM node:20-alpine

RUN apk add --no-cache bash tini

EXPOSE 3000

ENV CRANLIKE_MONGODB_SERVER="mongo" \
    VCAP_APP_HOST="0.0.0.0"

COPY . /frontend

WORKDIR /frontend

RUN npm install .

ENTRYPOINT [ "tini", "--", "/frontend/entrypoint.sh"]
