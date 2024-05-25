var express = require('express');
var router = express.Router();

// A user to test with locally
var universe = 'rstudio'
var fields = ['Package', 'Version', 'OS_type', '_user', '_owner', '_commit', '_maintainer', '_upstream', '_registered',
  '_created', '_linuxdevel', '_winbinary', '_macbinary', '_wasmbinary', '_pkgdocs', '_status', '_buildurl', '_failure'];
var apiurl = `https://${universe}.r-universe.dev/api/packages?limit=2500&all=true&fields=${fields.join()}`;

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

function get_universe_data(){
  return get_json(apiurl)
}

function format_yymmdd(x){
  const date = new Date(x || NaN);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function is_ok(status){
  return ['success', 'skipped', 'pending'].includes(status);
}

function all_ok(pkg){
  if(pkg._user == 'ropensci' && pkg._pkgdocs === 'failure'){
    return false;
  }
  return is_ok(pkg._status) && is_ok(pkg._macbinary) && is_ok(pkg._linuxdevel) &&
    is_ok(pkg._wasmbinary) && (is_ok(pkg._winbinary) || pkg.OS_type === 'unix')
}

function retry_url(x){
  var retrytype = x._failure ? 'failure' : 'src';
  var retryversion = x._failure ? x._failure.version : x.Version;
  return `https://${x._user}.r-universe.dev/packages/${x.Package}/${retryversion}/${retrytype}`;
}

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'R-universe' });
});

router.get('/builds', function(req, res, next) {
  get_universe_data().then(function(pkgdata){
    res.render('builds', {
      title: `R packages by ${universe}`,
      all_ok: all_ok,
      retry_url: retry_url,
      format_yymmdd: format_yymmdd,
      universe: universe,
      pkgdata: pkgdata
    });
  });
});

router.get('/favicon.ico', function(req, res, next) {
  res.status(404).send("No favicon yet")
});

module.exports = router;
