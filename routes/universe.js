var express = require('express');
var router = express.Router();

// A user to test with locally
var universe = 'eddelbuettel'


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

function get_universe_data(fields, all = true){
  var apiurl = `https://${universe}.r-universe.dev/api/packages?fields=${fields.join()}&limit=2500${all ? '&all=true' : ''}`;
  return get_json(apiurl)
}

function sort_by_package(x,y){
  return x.Package.toLowerCase() < y.Package.toLowerCase() ? -1 : 1
}

function format_count(count){
  return count < 1000 ? count : (count/1000).toFixed(1) + 'k';
}

function format_yymmdd(x){
  const date = new Date(x || NaN);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function format_time_since(ts){
  var date = new Date(ts*1000);
  var now = new Date();
  var diff_time = now.getTime() - date.getTime();
  var diff_hours = Math.round(diff_time / (1000 * 3600));
  var diff_days = Math.round(diff_hours / 24);
  if(diff_hours < 24){
    return diff_hours + " hours ago"
  } else if(diff_days < 31){
    return diff_days + " days ago";
  } else if (diff_days < 365){
    return Math.round(diff_days / 30) + " months ago";
  } else {
    return Math.round(diff_days / 365) + " years ago";
  }
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
  res.render('index', {
    universe: universe
  });
});

router.get('/builds', function(req, res, next) {
  var fields = ['Package', 'Version', 'OS_type', '_user', '_owner', '_commit.time', '_commit.id',
    '_maintainer', '_upstream', '_registered', '_created', '_linuxdevel', '_winbinary',
    '_macbinary', '_wasmbinary', '_pkgdocs', '_status', '_buildurl', '_failure'];
  get_universe_data(fields).then(function(pkgdata){
    res.render('builds', {
      format_yymmdd: format_yymmdd,
      all_ok: all_ok,
      retry_url: retry_url,
      universe: universe,
      pkgdata: pkgdata
    });
  }).catch(next);
});

router.get("/packages", function(req, res, next){
  var fields = ['Package', 'Version', 'Title', 'Description', '_user', '_commit.time',
    '_stars', '_rundeps', '_usedby', '_score', '_topics', '_pkglogo', '_sysdeps'];
  get_universe_data(fields).then(function(pkgdata){
    res.render('packages', {
      format_count: format_count,
      format_time_since: format_time_since,
      universe: universe,
      pkgdata: pkgdata
    });
  }).catch(next);
});

router.get("/badges", function(req, res, next){
  var fields = ['Package', '_user', '_registered'];
  get_universe_data(fields).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._registered);
    pkgdata.unshift({Package: ':total', _user: universe});
    pkgdata.unshift({Package: ':registry', _user: universe});
    pkgdata.unshift({Package: ':name', _user: universe});
    pkgdata = pkgdata.sort(sort_by_package).map(function(x){
      return Object.assign(x, {
        badge: `https://${x._user}.r-universe.dev/badges/${x.Package}`,
        link: `https://${x._user}.r-universe.dev/${x.Package[0] == ":" ? "" : x.Package}`
      });
    });
    res.render('badges', {
      universe: universe,
      pkgdata: pkgdata
    });
  }).catch(next);
});

router.get("/apis", function(req, res, next){
  var fields = ['_datasets'];
  get_universe_data(fields, false).then(function(pkgdata){
    res.render('apis', {
      universe: universe,
      pkgdata: pkgdata.sort(sort_by_package)
    });
  }).catch(next);
});

router.get("/contributors", function(req, res, next){
  res.render('contributors', {
    universe: universe
  });
});

router.get('/favicon.ico', function(req, res, next) {
  res.status(404).send("No favicon yet")
});

module.exports = router;
