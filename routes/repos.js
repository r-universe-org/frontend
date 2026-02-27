import express from 'express';
import zlib from 'node:zlib';
import createError from 'http-errors';
import {doc_to_dcf} from '../src/tools.js';
import {get_universe_binaries, get_packages_index, get_package_hash} from '../src/db.js';

const router = express.Router();

function doc_to_ndjson(x){
  return JSON.stringify(x) + '\n';
}

//If distro is not postfixed with -arm64 or -x86_64, we assume x86_64.
function parse_distro(x){
  var input = x.replace('arm64', 'aarch64').split('-');
  var tail = input.pop();
  if(tail == 'aarch64' || tail == 'x86_64'){
    return [input.join('-'), tail];
  } else {
    return [x, 'x86_64'];
  }
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

function packages_index(query, req, res, mixed = false, override_arch = false){
  query._user = res.locals.universe;
  if(req.query.filter){
    query.Package = {$in: req.query.filter.split(',')};
  }
  var format = req.params.format || "PACKAGES.json";
  if(format.startsWith("sha256")){
    //On r-universe.dev we redirect sha256:* with a cloudflare rule, so this is only for local use.
    return res.redirect(301, `https://cdn.r-universe.dev/${format.substring(7)}`);
  }
  if(format == 'PACKAGES.rds'){
    return res.status(404).send("PACKAGES.rds format not supported for now.");
  } else if(format !== 'PACKAGES' && format !== 'PACKAGES.gz' && format !== 'PACKAGES.json'){
    throw createError(404, 'Unsupported PACKAGES format: ' + format);
  }
  var fields = req.query.fields ? req.query.fields.split(",") : [];
  if(res.locals.universe != 'cran'){
    //To help pak, but for CRAN sysreqs the P3M API works better.
    fields.push('_sysdeps');
  }
  var cursor = get_packages_index(query, fields, mixed);
  function doc_to_dcf_wrap(x){
    if(x._type == 'linux' && override_arch){
      x.Platform = `${override_arch}-${override_arch == 'x86_64' ? 'pc' : 'unknown'}-linux-gnu`; //pak cannot identify multi-arch binaries
    }
    var use_sha_file = req.headers['user-agent'].match(/rclone/) ? false : true;
    return doc_to_dcf(x, use_sha_file)
  }
  switch (format) {
    case 'PACKAGES':
      return cursor_stream(cursor, res.type('text/plain'), doc_to_dcf_wrap);
    case 'PACKAGES.gz':
      return cursor_stream(cursor, res.type('application/x-gzip'), doc_to_dcf_wrap, true);
    case 'PACKAGES.json':
      return cursor_stream(cursor, res.type('text/plain'), doc_to_ndjson);
  }
  throw createError(404, 'Unknown PACKAGES format: ' + format);
}

function send_binary(query, req, res, postfix = ""){
  query._user = res.locals.universe;
  if(!query.Version)
    throw createError(404, 'No package version given');
  return get_package_hash(query).then(function(x){
    const hash = x._fileid;
    //const cdn = req.headers.host === 'localhost:3000' ? '/cdn' : 'https://cdn.r-universe.dev';
    const cdn = 'https://cdn.r-universe.dev';
    res.redirect(`${cdn}/${hash}${postfix}`);
  }).catch(function(){
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

router.get('/bin/windows{/:distro}/contrib/:major/:pkg.zip', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var [distro, arch] = parse_distro(req.params.distro || "gcc-x86_64");
  var query = {_type: 'win', _major: req.params.major, Package: pkg,
    Version: version, _arch: arch};
  return send_binary(query, req, res);
});

router.get('/bin/macosx/:distro/contrib/:major/:pkg.tgz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var [distro, arch] = parse_distro(req.params.distro);
  var query = {_type: 'mac', _major: req.params.major, Package: pkg,
    Version: version, _arch: arch};
  return send_binary(query, req, res);
});

router.get('/bin/linux/:distro/contrib/:major/:pkg.tar.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var [distro, arch] = parse_distro(req.params.distro);
  var target = (distro == 'noble') ? {_distro: distro} : {_portable: true};
  var query = {Package: pkg, Version: version,
    _type: 'linux', _arch: arch, _major : req.params.major, ...target};
  return send_binary(query, req, res);
});

/* Mixed src and binary */
router.get('/bin/linux/:distro/:major/src/contrib/:pkg.tar.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var [distro, arch] = parse_distro(req.params.distro);
  var target = (distro == 'noble') ? {_distro: distro} : {_portable: true};
  var query = {Package: pkg, Version: version, '$or': [
    {_type: 'src'},
    {_type: 'linux', _arch: arch, _major : req.params.major, ...target}
  ]};
  return send_binary(query, req, res);
});

router.get('/bin/emscripten/contrib/:major/:pkg.tgz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', _major : req.params.major,
    Package: pkg, Version: version};
  return send_binary(query, req, res);
});

/* Some legacy endpoints for webR 4.3. remove for R-4.5  */
router.get('/bin/emscripten/contrib/:major/:pkg.data.gz', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', _major : req.params.major,
    Package: pkg, Version: version};
  return send_binary(query, req, res);
});

router.get('/bin/emscripten/contrib/:major/:pkg.data', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', _major : req.params.major,
    Package: pkg, Version: version};
  return send_binary(query, req, res, `/decompress`);
});

router.get('/bin/emscripten/contrib/:major/:pkg.js.metadata', function(req, res, next) {
  var [pkg, version] = req.params.pkg.split("_");
  var query = {_type: 'wasm', _major : req.params.major,
    Package: pkg, Version: version};
  return send_binary(query, req, res, `/index`);
});

/* PACKAGES index files */

router.get('/src/contrib{/:format}', function(req, res, next) {
  return packages_index({_type: 'src'}, req, res);
});

router.get('/bin/windows{/:distro}/contrib/:major{/:format}', function(req, res, next) {
  var [distro, arch] = parse_distro(req.params.distro || "gcc-x86_64");
  var query = {
    _type: 'win',
    _major : req.params.major,
    _arch: arch
  };
  return packages_index(query, req, res);
});

router.get('/bin/macosx/:distro/contrib/:major{/:format}', function(req, res, next) {
  var [distro, arch] = parse_distro(req.params.distro);
  var query = {
    _type: 'mac',
    _major: req.params.major,
    _arch: arch
  };
  return packages_index(query, req, res);
});

/* Linux binaries ONLY */
router.get('/bin/linux/:distro/contrib/:major{/:format}', function(req, res, next) {
  var [distro, arch] = parse_distro(req.params.distro);
  var target = (distro == 'noble') ? {_distro: distro} : {_portable: true};
  var query = {_type: 'linux', _arch: arch, _major: req.params.major, ...target};
  return packages_index(query, req, res, false, arch);
});

/* Linux binaries with fallback on source packages */
router.get('/bin/linux/:distro/:major/src/contrib{/:format}', function(req, res, next) {
  var [distro, arch] = parse_distro(req.params.distro);
  var target = (distro == 'noble') ? {_distro: distro} : {_portable: true};
  var query = {'$or': [
    {_type: 'src'},
    {_type: 'linux', _arch: arch, _major: req.params.major, ...target},
  ]};
  return packages_index(query, req, res, true, arch);
});

router.get('/bin/emscripten/contrib/:major{/:format}', function(req, res, next) {
  var query = {
    _type: 'wasm',
    _major: req.params.major
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

router.get(['/bin/macosx', '/bin/macosx/:platform'], function(req, res, next) {
  res.redirect(`/bin/macosx/${req.params.platform}/contrib`);
});

router.get('/bin/linux/:distro/:major', function(req, res, next) {
  res.redirect(`/bin/linux/${req.params.distro}/${req.params.major}/src/contrib`);
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
