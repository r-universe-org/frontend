import express from 'express';
import {mongo_all_universes, mongo_dump, mongo_search, mongo_everyone, mongo_all_files, mongo_summary, 
  mongo_universe_topics, mongo_usedbyorg, mongo_all_sysdeps} from '../src/db.js';
import {cursor_stream, build_query, send_results} from '../src/tools.js';
const router = express.Router();

router.get('/api/revdeps/:package', function(req, res, next){
  var cursor = mongo_usedbyorg(req.params.package);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

// This omits empty (failure-only) universes; use /api/everyone to get these
router.get("/api/universes", function(req, res, next) {
  var limit = parseInt(req.query.limit) || 100000;
  var cursor = mongo_all_universes(req.params.type == 'organization', limit);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get("/api/organizations", function(req, res, next) {
  var limit = parseInt(req.query.limit) || 100000;
  var cursor = mongo_all_universes(true, limit);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
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

router.get('/api/everyone', function(req, res, next){
  var query = {_type: {$in: ['src', 'failure']}, _registered : true};
  return mongo_everyone(query).then(x => res.send(x));
});

router.get('/api/topics', function(req, res, next){
  var min =  parseInt(req.query.min) || 5;
  var limit =  parseInt(req.query.limit) || 200;
  var cursor = mongo_universe_topics(null, min, limit);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/sysdeps{/:distro}', function(req, res, next){
  var cursor = mongo_all_sysdeps(null,req.params.distro);
  return send_results(cursor, res.type('text/plain'), req.query.stream);
});

router.get('/api/files', function(req, res, next){
  var cursor = mongo_all_files(null, req.query.type, req.query.before, req.query.fields);
  return send_results(cursor, res.type('text/plain'), true);
});

router.get('/api/summary', function(req, res, next){
  return mongo_summary().then(x => res.send(x));
});

/* Legacy redirects */
router.get("/stats/everyone", function(req, res, next) {
  res.redirect(req.url.replace("stats/everyone", "api/everyone"));
});

router.get("/stats/files", function(req, res, next) {
  res.redirect(req.url.replace("stats/files", "api/files"));
});

router.get("/stats/summary", function(req, res, next) {
  res.redirect(req.url.replace("stats/summary", "api/summary"));
});

router.get("/stats/topics", function(req, res, next) {
  res.redirect(req.url.replace("stats/topics", "api/topics?stream=true"));
});

router.get("/stats/sysdeps", function(req, res, next) {
  res.redirect(req.url.replace("stats/sysdeps", "api/sysdeps?stream=true"));
});

router.get("/stats/usedbyorg", function(req, res, next) {
  res.redirect(req.url.replace("stats/usedbyorg", `api/revdeps/${req.query.package}?stream=true`));
});

export default router;
