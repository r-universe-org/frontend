#!/bin/bash
set -eo pipefail

function wait_tcp_port {
    local host="$1" port="$2"
    local max_tries=5 tries=1

    # see http://tldp.org/LDP/abs/html/devref1.html for description of this syntax.
    while ! exec 6<>/dev/tcp/$host/$port && [[ $tries -lt $max_tries ]]; do
        sleep 1s
        tries=$(( tries + 1 ))
        echo "$(date) retrying to connect to $host:$port ($tries/$max_tries)"
    done
    exec 6>&-
}

# wait for the mongo server to be available
echo Waiting for ${CRANLIKE_MONGODB_SERVER}:${CRANLIKE_MONGODB_PORT:-27017}...
wait_tcp_port "${CRANLIKE_MONGODB_SERVER}" "${CRANLIKE_MONGODB_PORT:-27017}"

# run mongo-express
exec npm start
