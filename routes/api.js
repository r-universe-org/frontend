import express from 'express';
import {ls_packages, mongo_universe_packages, mongo_universe_maintainers, get_package_info, mongo_dump, mongo_usedbyorg,
  mongo_search, mongo_everyone, mongo_all_files, mongo_summary, mongo_universe_updates, mongo_universe_topics, mongo_all_sysdeps} from '../src/db.js';
import {cursor_stream, build_query, send_results} from '../src/tools.js';

const router = express.Router();

router.get('/api', function(req, res, next) {
  res.redirect(301, `/api/ls`);
});

router.get('/api/ls', function(req, res, next) {
  ls_packages(res.locals.universe).then(x => res.send(x));
});

router.get('/api/packages', function(req, res, next) {
  var fields = req.query.fields && req.query.fields.split(",");
  var limit = parseInt(req.query.limit) || 2500;
  var all = req.query.all != undefined;
  var stream = req.query.stream;
  return mongo_universe_packages(res.locals.universe, fields, limit, all).then(function(x){
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

router.get('/api/revdeps/:package', function(req, res, next){
  var cursor = mongo_usedbyorg(req.params.package, res.locals.universe);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/maintainers', function(req, res, next) {
  var limit = parseInt(req.query.limit) || 100;
  var stream = req.query.stream || false;
  var cursor = mongo_universe_maintainers(res.locals.universe, limit);
  return send_results(cursor, res.type('text/plain'), stream);
});

router.get("/api/search", function(req, res, next) {
  var query = {_type: 'src', _registered : true, _universes: res.locals.universe};
  var limit = parseInt(req.query.limit) || 100;
  var skip = parseInt(req.query.skip) || 0;
  return Promise.resolve().then(() => {
    build_query(query, req.query.q || "");
    return mongo_search(query, limit, skip).then(x => res.send(x));
  });
});

router.get('/api/everyone', function(req, res, next){
  var query = {_type: {$in: ['src', 'failure']}, _registered : true, _user: res.locals.universe};
  return mongo_everyone(query).then(x => res.send(x));
});

router.get("/api/dbdump", function(req, res, next) {
  var query = {_universes: res.locals.universe};
  if(req.query.binaries){
    //This still does not find binaries for cross referenced packages, but ok
    query = {'$or' : [{_universes: res.locals.universe}, {_user: res.locals.universe}]};
  }
  var cursor = mongo_dump(query);
  return cursor_stream(cursor, res.type("application/bson"));
});

router.get('/api/updates', function(req, res, next){
  var cursor = mongo_universe_updates(res.locals.universe);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/topics', function(req, res, next){
  var cursor = mongo_universe_topics(res.locals.universe);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/sysdeps{/:distro}', function(req, res, next){
  var cursor = mongo_all_sysdeps(res.locals.universe,req.params.distro);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/files', function(req, res, next){
  var cursor = mongo_all_files(res.locals.universe, req.query.type, req.query.before, req.query.fields);
  return send_results(cursor, res.type('text/plain'), true); //always stream
});

router.get('/api/summary', function(req, res, next){
  return mongo_summary(res.locals.universe).then(x => res.send(x));
});

/* Legacy redirects */

router.get("/stats/files", function(req, res, next) {
  res.redirect(req.url.replace("stats/files", "api/files"));
});

router.get("/stats/summary", function(req, res, next) {
  res.redirect(req.url.replace("stats/summary", "api/summary"));
});

router.get("/stats/updates", function(req, res, next) {
  res.redirect(req.url.replace("stats/updates", "api/updates?stream=true"));
});

router.get("/stats/topics", function(req, res, next) {
  res.redirect(req.url.replace("stats/topics", "api/topics?stream=true"));
});

router.get("/stats/sysdeps", function(req, res, next) {
  res.redirect(req.url.replace("stats/sysdeps", "api/sysdeps?stream=true"));
});

router.get("/stats/maintainers", function(req, res, next) {
  res.redirect(req.url.replace("stats/maintainers", "api/maintainers?stream=true"));
});

router.get("/stats/usedbyorg", function(req, res, next) {
  res.redirect(req.url.replace("stats/usedbyorg", `api/revdeps/${req.query.package}?stream=true`));
});

export default router;
