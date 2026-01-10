import express from 'express';
import {get_repositories, mongo_dump} from '../src/db.js';
import {cursor_stream} from '../src/tools.js';
const router = express.Router();

router.get("/api/universes", function(req, res, next) {
  get_repositories().then(function(data){
    res.send(data);
  });
});

router.get("/api/dbdump", function(req, res, next) {
  var query = {};
  if(!req.query.everything){
    query._type = 'src'
  }
  var cursor = mongo_dump(query, {raw: true});
  return cursor_stream(cursor, res.type("application/bson"));
});

export default router;
