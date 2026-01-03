#!/bin/sh
# Usage: 
# ./run-local.sh
# ./run-local.sh tidyverse
# ./run-local.sh tidyverse --download
export UNIVERSE="${1:-ropensci}"
export NODE_ENV=production

# Kill child process on exit
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Start dummy server on port 3993
mkdir -p /tmp/runiverse
DEBUG=cranlike:* mongod --bind_ip_all --port 3993 --dbpath /tmp/runiverse --logpath mongo.log & sleep 1

# If --download is given download some data
if [ "$2" = "--download" ]; then
  echo "Copying data for $UNIVERSE"
  curl -L "https://$UNIVERSE.r-universe.dev/api/dbdump?everything=1" -o $UNIVERSE.bson
  mongorestore --port 3993 -d cranlike --drop -c packages $UNIVERSE.bson
  rm -fv $UNIVERSE.bson
else
  echo "Tip: run this script one time with --download to download dummy data for this universe"
fi

CRANLIKE_MONGODB_PORT=3993 npm start
