#!/bin/sh
if [ -f "/opt/homebrew/etc/mongod.conf" ]; then
mongoconfig="/opt/homebrew/etc/mongod.conf"
else
mongoconfig="/usr/local/etc/mongod.conf"
fi
export NODE_ENV=production
export UNIVERSE=ropensci
DEBUG=cranlike:* mongod --config $mongoconfig & sleep 2 & npm start

