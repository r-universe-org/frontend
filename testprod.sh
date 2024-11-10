#!/bin/sh
# NB: docker compose server should be restarted without -d to open external mongo port
eval $(cat ../production-server/secrets.env) CRANLIKE_MONGODB_SERVER=packages.r-universe.dev npm start
