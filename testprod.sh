#!/bin/sh
# NB: docker compose server should be restarted without -d to open external mongo port
export CRANLIKE_MONGODB_SERVER=packages.r-universe.dev
eval $(cat ../production-server/secrets.env) npm start
