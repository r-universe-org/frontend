import express from 'express';
import url from 'node:url';
import {ls_packages, get_universe_packages, get_package_info, mongo_dump} from '../src/db.js';
import {cursor_stream} from '../src/tools.js';

const router = express.Router();

router.get('/api', function(req, res, next) {
  res.redirect(301, `/api/ls`);
});

router.get('/api/ls', function(req, res, next) {
  ls_packages(res.locals.universe).then(x => res.send(x));
});

router.get('/api/packages', function(req, res, next) {
  var fields = req.query.fields && req.query.fields.split(",");
  var limit = req.query.limit || 2500;
  var all = req.query.all != undefined;
  var stream = req.query.stream;
  return get_universe_packages(res.locals.universe, fields, limit, all).then(function(x){
    if(stream){
      res.type('text/plain');
      x.forEach(doc => res.write(JSON.stringify(doc)));
      res.end();
    } else {
      res.send(x);
    }
  });
});

router.get('/api/packages/:package', function(req, res, next) {
  return get_package_info(req.params.package, res.locals.universe).then(function(x){
    res.send(x);
  });
});

router.get("/api/dbdump", function(req, res, next) {
  var query = {_user: res.locals.universe};
  if(!req.query.everything){
    query._type = 'src'
  }
  var cursor = mongo_dump(query);
  return cursor_stream(cursor, res.type("application/bson"));
});

export default router;
