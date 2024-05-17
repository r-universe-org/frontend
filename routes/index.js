var express = require('express');
var router = express.Router();

function get_url(url){
  return fetch(url).then((res) => {
    if (res.ok) {
      return res;
    }
    throw new Error(`HTTP ${res.status} for: ${url}`);
  });
}

function get_json(url){
  return get_url(url).then((res) => res.json());
}

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'R-universe' });
});

router.get('/:package', function(req, res, next) {
  return get_json(`https://cran.dev/${req.params.package}/json`).then(function(pkgdata){
    return res.render('pkginfo', pkgdata);
  }).catch(next);
});

module.exports = router;
