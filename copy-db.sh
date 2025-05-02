#!/bin/sh
echo "use cranlike\ndb.dropDatabase()" | mongosh
for user in ropensci jeroen; do
  echo "Copying data for $user"
  curl -L "https://$user.r-universe.dev/api/dbdump?everything=1" -o $user.bson
  mongorestore -d cranlike -c packages $user.bson
  rm -f $user.bson
done
