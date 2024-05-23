var express = require('express');
var router = express.Router();

// A user to test with locally
var universe = 'r-forge'
var fields = ['Package', 'Version', 'OS_type', '_user', '_owner', '_commit', '_maintainer', '_upstream', '_binaries', '_sysdeps',
  '_created', '_winbinary', '_macbinary', '_wasmbinary', '_status', '_buildurl', '_failure', '_type', '_registered', '_pkgdocs',
  'Title', 'Description', '_rundeps', '_stars', '_score', '_topics', '_pkglogo'];
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

function format_date(x){
  const date = new Date(x);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'R-universe' });
});

router.get('/builds', function(req, res, next) {
  get_universe_data().then(function(pkgdata){
    res.render('builds', {
      format_date: format_date,
      universe: universe,
      pkgdata: pkgdata
    });
  });
});

router.get('/favicon.ico', function(req, res, next) {
  res.status(404).send("No favicon yet")
});

module.exports = router;
