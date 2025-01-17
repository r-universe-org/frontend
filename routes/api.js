import express from 'express';
import url from 'node:url';
import {ls_packages, get_package_info, get_universe_packages} from '../src/db.js';

const router = express.Router();

router.get('/api', function(req, res, next) {
  res.redirect(301, `/api/ls`);
});

router.get('/api/ls', function(req, res, next) {
  return ls_packages(res.locals.universe).then(x => res.send(x));
});

router.get('/api/packages', function(req, res, next) {
  var fields = req.query.fields && req.query.fields.split(",");
  return get_universe_packages(res.locals.universe, fields).then(function(x){
    res.send(x);
  });
});

router.get('/api/packages/:package', function(req, res, next) {
  var fields = req.query.fields && req.query.fields.split(",");
  return get_package_info(req.params.package, res.locals.universe, fields).then(function(x){
    res.send(x)
  });
});

export default router;
