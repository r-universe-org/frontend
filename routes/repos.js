import express from 'express';
import zlib from 'node:zlib';
import createError from 'http-errors';
import {doc_to_dcf, match_macos_arch} from '../src/tools.js';
import {get_universe_binaries, get_packages_index, get_package_hash} from '../src/db.js';

const router = express.Router();

function doc_to_ndjson(x){
  return JSON.stringify(x) + '\n';
}

// Somehow node:stream/promises does not catch input on-error callbacks properly
// so we promisify ourselves. See https://github.com/r-universe-org/help/issues/540
function cursor_stream(cursor, output, transform, gzip){
  return new Promise(function(resolve, reject) {
    var input = cursor.stream({transform: transform}).on('error', reject);
    if(gzip){
      input = input.pipe(zlib.createGzip()).on('error', reject);
    }
    input.pipe(output).on('finish', resolve).on('error', reject);
  });
}

function packages_index(query, req, res, mixed = false){
  query._user = res.locals.universe;
  var format = req.params.format || "PACKAGES.json";
  if(format == 'PACKAGES.rds'){
    return res.status(404).send("PACKAGES.rds format not supported for now.");
  } else if(format !== 'PACKAGES' && format !== 'PACKAGES.gz' && format !== 'PACKAGES.json'){
    throw createError(404, 'Unsupported PACKAGES format: ' + format);
  }
  var fields = req.query.fields ? req.query.fields.split(",") : [];
  var cursor = get_packages_index(query, fields, mixed);
  switch (format) {
    case 'PACKAGES':
      return cursor_stream(cursor, res.type('text/plain'), doc_to_dcf);
    case 'PACKAGES.gz':
      return cursor_stream(cursor, res.type('application/x-gzip'), doc_to_dcf, true);
    case 'PACKAGES.json':
      return cursor_stream(cursor, res.type('text/plain'), doc_to_ndjson);      
  }
  throw createError(404, 'Unknown PACKAGES format: ' + format);
}

function send_binary(query, req, res, postfix = ""){
  query._user = res.locals.universe;
  return get_package_hash(query).then(function(x){
    const hash = x._fileid;
    //const cdn = req.headers.host === 'localhost:3000' ? '/cdn' : 'https://cdn.r-universe.dev';
    const cdn = 'https://cdn.r-universe.dev';
    res.redirect(`${cdn}/${hash}${postfix}`);
  }).catch(function(err){
    // Workaround for race conditions: redirect to new version if just updated
    // This does not help if pak would use the DownloadURL from the PACKAGES file
    const newquery = {...query, _previous: query.Version, Version:{ $exists: true }};
    return get_package_hash(newquery).then(function(x){
      res.redirect(req.path.replace(`_${query.Version}.`, `_${x.Version}.`));
    });
  });
}

/* Match against files first */
router.get('/src/contrib/:pkg.tar.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'src', Package: pkg, Version: version};
  return send_binary(query, req, res);
});

router.get('/bin/windows/contrib/:built/:pkg.zip', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'win', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version};
  return send_binary(query, req, res);
});

router.get('/bin/macosx/:arch/contrib/:built/:pkg.tgz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'mac', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version, 'Built.Platform' : match_macos_arch(req.params.arch)};
  return send_binary(query, req, res);
});

router.get('/bin/linux/:distro/:built/src/contrib/:pkg.tar.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {Package: pkg, Version: version, '$or': [
    {_type: 'src'},
    {_type: 'linux', '_distro': req.params.distro, 'Built.R' : {$regex: '^' + req.params.built}},
  ]};
  return send_binary(query, req, res);
});

router.get('/bin/emscripten/contrib/:built/:pkg.tgz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version};
  return send_binary(query, req, res);
});

/* Some legacy endpoints for webR 4.3. remove for R-4.5  */
router.get('/bin/emscripten/contrib/:built/:pkg.data.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version};
  return send_binary(query, req, res);
});

router.get('/bin/emscripten/contrib/:built/:pkg.data', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version};
  return send_binary(query, req, res, `/decompress`);
});

router.get('/bin/emscripten/contrib/:built/:pkg.js.metadata', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', 'Built.R' : {$regex: '^' + req.params.built},
    Package: pkg, Version: version};
  return send_binary(query, req, res, `/index`);
});

/* PACKAGES index files */

router.get('/src/contrib{/:format}', function(req, res, next) {
  return packages_index({_type: 'src'}, req, res);
});

router.get('/bin/windows/contrib/:built{/:format}', function(req, res, next) {
  var query = {
    _type: 'win', 
    'Built.R' : {$regex: '^' + req.params.built}
  };
  return packages_index(query, req, res);
});

router.get('/bin/macosx/:arch/contrib/:built{/:format}', function(req, res, next) {
  var query = {
    _type: 'mac', 
    'Built.R' : {$regex: '^' + req.params.built},
    'Built.Platform': match_macos_arch(req.params.arch)
  };
  return packages_index(query, req, res);
});

/* Linux binaries with fallback on source packages */
router.get('/bin/linux/:distro/:built/src/contrib{/:format}', function(req, res, next) {
  var query = {'$or': [
    {_type: 'src'},
    {_type: 'linux', '_distro': req.params.distro, 'Built.R' : {$regex: '^' + req.params.built}},
  ]};
  return packages_index(query, req, res, true);
});

router.get('/bin/emscripten/contrib/:built{/:format}', function(req, res, next) {
  var query = {
    _type: 'wasm', 
    'Built.R' : {$regex: '^' + req.params.built}
  };
  return packages_index(query, req, res);
});

/* Some helper redirects and stats */ 
router.get('/bin/windows', function(req, res, next) {
  res.redirect('/bin/windows/contrib');
});

router.get('/bin/emscripten', function(req, res, next) {
  res.redirect('/bin/emscripten/contrib');
});

router.get(['/bin/macosx', '/bin/macosx/:arch'], function(req, res, next) {
  res.redirect('/bin/macosx/big-sur-arm64/contrib');
});

router.get('/bin/linux/:distro/:built', function(req, res, next) {
  res.redirect(`/bin/linux/${req.params.distro}/${req.params.built}/src/contrib`);
});

router.get('/src', function(req, res, next) {
  return get_universe_binaries(res.locals.universe, 'src').then(x => res.send(x));
});

router.get('/bin', function(req, res, next) {
  return get_universe_binaries(res.locals.universe).then(x => res.send(x));
});

router.get('/bin/windows/contrib/', function(req, res, next){
  return get_universe_binaries(res.locals.universe, 'win').then(x => res.send(x));
});

router.get('/bin/emscripten/contrib/', function(req, res, next){
  return get_universe_binaries(res.locals.universe, 'wasm').then(x => res.send(x));
});

router.get('/bin/macosx/:arch/contrib', function(req, res, next){
  return get_universe_binaries(res.locals.universe, 'mac').then(x => res.send(x));
});

export default router;
