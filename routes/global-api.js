import express from 'express';
import {get_repositories, mongo_dump, mongo_search} from '../src/db.js';
import {cursor_stream, build_query} from '../src/tools.js';
const router = express.Router();

router.get("/api/universes", function(req, res, next) {
  return get_repositories().then(function(data){
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

router.get("/api/search", function(req, res, next) {
  var query = {_type: 'src', _indexed : true};
  var limit = parseInt(req.query.limit) || 100;
  var skip = parseInt(req.query.skip) || 0;
  return Promise.resolve().then(() => {
    build_query(query, req.query.q || "");
    return mongo_search(query, limit, skip).then(x => res.send(x));
  });
});

export default router;
