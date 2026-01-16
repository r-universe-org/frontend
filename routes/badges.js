import express from 'express';
import badgen from 'badgen';
import {get_registry_info} from '../src/tools.js';
import {get_distinct, get_package_info} from '../src/db.js';

const router = express.Router();

function send_badge(badge, user, res, linkto){
  var svg = badgen.badgen(badge);
  var url = linkto || 'https://' + user + '.r-universe.dev';
  svg = svg.replace('<title>', '<a href="' + url + '" alt="r-universe">\n  <title>');
  svg = svg.replace('</svg>', '  </a>\n</svg>');
  res.type('image/svg+xml').send(svg);
}

router.get('/badges/\\::meta', function(req, res, next) {
  var user = res.locals.universe;
  var color = req.query.color;
  var meta = req.params.meta;
  var badge = {
    label: 'r-universe',
    color: color || 'blue',
    style: req.query.style,
    scale: req.query.scale
  };
  if(meta == 'name'){
    badge.status = user;
    send_badge(badge, user, res);
  } else if(meta == 'packages' || meta == 'total'){
    return get_distinct('Package', {_universes : user, _type: 'src', '_registered' : true}).then(function(x){
      badge.status = x.length + " packages";
      send_badge(badge, user, res, `https://${user}.r-universe.dev/packages`);
    });
  } else if(meta == 'articles' ){
    return get_distinct('_vignettes.title', {_universes : user, _type: 'src', '_registered' : true}).then(function(x){
      badge.status = x.length + " articles";
      send_badge(badge, user, res, `https://${user}.r-universe.dev/articles`);
    });
  } else if(meta == 'datasets' ){
    return get_distinct('_datasets.title', {_universes : user, _type: 'src', '_registered' : true}).then(function(x){
      badge.status = x.length + " datasets";
      send_badge(badge, user, res, `https://${user}.r-universe.dev/datasets`);
    });
  } else if(meta == 'registry'){
    /* This badge mimics https://github.com/r-universe/jeroen/actions/workflows/sync.yml/badge.svg (which is super slow) */
      return get_registry_info(user).then(function(data){
        if(data && data.workflow_runs && data.workflow_runs.length){
          const success = data.workflow_runs[0].conclusion == 'success';
          const linkto = 'https://github.com/r-universe/' + user + '/actions/workflows/sync.yml';
          badge.label = "Update universe";
          badge.color = success ? 'green' : 'red';
          badge.status = success ? 'passing' : 'failure';
          //unset default caching because registry status can change independent of our db
          res.set('ETag', "").set('Last-Modified', new Date().toUTCString());
          send_badge(badge, user, res, linkto);
        } else {
          throw "Failed to query workflow status from GitHub";
        }
      });
  } else {
    throw "Unsupported badge type :" + meta;
  }
});

/* redirect from previous api (was bad for caching) */
router.get('/badges/:package', function(req, res, next) {
  res.set('Cache-Control', 'public, max-age=31557600, immutable').redirect(301, `/${req.params.package}/badges/version`)
});

router.get('/:package/badges/version', function(req, res, next) {
  var user = res.locals.universe;
  var pkg = req.params.package;
  var color = req.query.color;
  var badge = {
    label: 'r-universe',
    status: 'unavailable',
    color: color || 'red',
    style: req.query.style,
    scale: req.query.scale
  };
  return get_distinct('Version', {_user : user, Package : pkg, _type: 'src', '_registered' : true}).then(function(x){
    if(x.length){
      badge.status = x.join("|");
      badge.color = color || 'green';
    }
    send_badge(badge, user, res, `https://${user}.r-universe.dev/${pkg}`);
  });
});

function check_result(pkg){
  let results = [];
  if(pkg._failure || pkg._status == 'failure')
    return 'FAILURE';
  for (var bin of pkg._binaries) {
    if(!bin.check)
      continue; //ignore wasm
    if(bin.r < pkg._rbuild)
      continue //ignore oldrel
    if(bin.commit != pkg._commit.id)
      return 'FAILURE' //no binary for this commit?
    results.push(bin.check)
  }
  if(results.includes('ERROR'))
    return 'ERROR'
  if(results.includes('WARNING'))
    return 'WARNING'
  if(results.includes('NOTE'))
    return 'NOTE'
  return results.length ? 'OK' : 'FAILURE';
}

router.get('/:package/badges/checks', function(req, res, next) {
  var user = res.locals.universe;
  var pkg = req.params.package;
  var color = req.query.color;
  var badge = {
    label: 'r-universe',
    status: 'unavailable',
    color: color || 'red',
    style: req.query.style,
    scale: req.query.scale
  };
  return get_package_info(pkg, user).then(function(x){
    badge.status = check_result(x);
    if(badge.status == 'WARNING'){
      badge.color = color || 'orange';
    }
    if(badge.status == 'NOTE' || badge.status == 'OK'){
      badge.color = color || 'green';
    }
    send_badge(badge, user, res, x._buildurl);
  });
});

export default router;
