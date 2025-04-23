#!/bin/sh
echo "use cranlike\ndb.dropDatabase()" | mongosh
curl -L "https://ropensci.r-universe.dev/api/dbdump?everything=1" -o ropensci.bson
curl -L "https://bioc.r-universe.dev/api/dbdump?everything=1" -o bioc.bson
mongorestore -d cranlike -c packages ropensci.bson
mongorestore -d cranlike -c packages bioc.bson
rm -f ropensci.bson bioc.bson
