#!/bin/sh
echo "use cranlike\ndb.dropDatabase()" | mongosh
curl -L "https://ropensci.r-universe.dev/api/dbdump?everything=1" -o ropensci.bson
mongorestore -d cranlike -c packages ropensci.bson
rm -f ropensci.bson


