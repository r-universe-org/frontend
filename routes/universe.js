import express from 'express';
import {get_universe_packages, get_universe_vignettes, get_package_info} from '../src/db.js';
const router = express.Router();

function sort_by_package(x,y){
  return x.Package.toLowerCase() < y.Package.toLowerCase() ? -1 : 1
}

function sort_by_date(x,y){
  return x.updated < y.updated ? -1 : 1
}

function sort_by_score(x,y){
  return x._score > y._score ? -1 : 1
}

function format_count(count){
  if(count > 1000000) {
    var val = count/1000000;
    return val.toFixed(val < 10 ? 1 : 0) + 'M';
  }
  if(count > 1000) {
    var val = count / 1000;
    return val.toFixed(val < 10 ? 1 : 0) + 'k';
  }
  return count;
}

function format_yymmdd(x){
  const date = new Date(x || NaN);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function convert_date(timestamp){
  if(!timestamp) return;
  const date = new Date(parseInt(timestamp)*1000);
  if(!date) return;
  return date.toUTCString();
}

function parse_date(x){
  if(typeof x === 'number'){
    x = x*1000;
  }
  if(typeof x === 'string'){
    x = x.replace(" ", "T");
  }
  return new Date(x)
}

function format_time_since(x){
  var date = parse_date(x)
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
  return (!pkg._failure) && is_ok(pkg._status) && is_ok(pkg._macbinary) && is_ok(pkg._linuxdevel) &&
    is_ok(pkg._wasmbinary) && (is_ok(pkg._winbinary) || pkg.OS_type === 'unix')
}

function build_url(x){
  return x._failure ? x._failure.buildurl : x._buildurl;
}

function retry_url(x){
  var retrytype = x._failure ? 'failure' : 'src';
  var retryversion = x._failure ? x._failure.version : x.Version;
  return `https://${x._user}.r-universe.dev/packages/${x.Package}/${retryversion}/${retrytype}`;
}

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index');
});

router.get('/builds', function(req, res, next) {
  var fields = ['Package', 'Version', 'OS_type', '_user', '_owner', '_commit.time', '_commit.id',
    '_maintainer', '_upstream', '_registered', '_created', '_linuxdevel', '_winbinary',
    '_macbinary', '_wasmbinary', '_pkgdocs', '_status', '_buildurl', '_failure'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    res.render('builds', {
      format_yymmdd: format_yymmdd,
      format_time_since: format_time_since,
      all_ok: all_ok,
      build_url: build_url,
      retry_url: retry_url,
      pkgdata: pkgdata
    });
  });
});

router.get("/packages", function(req, res, next){
  var fields = ['Package', 'Version', 'Title', 'Description', '_user', '_commit.time', '_downloads',
    '_stars', '_rundeps', '_usedby', '_score', '_topics', '_pkglogo', '_registered', '_searchresults'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    res.render('packages', {
      format_count: format_count,
      format_time_since: format_time_since,
      pkgdata: pkgdata.sort(sort_by_score)
    });
  });
});

router.get("/badges", function(req, res, next){
  var universe = res.locals.universe;
  var fields = ['Package', '_user', '_registered'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._registered).sort(sort_by_package);
    pkgdata.unshift({Package: ':datasets', _user: universe, ref: '/datasets'});
    pkgdata.unshift({Package: ':articles', _user: universe, ref: '/articles'});
    pkgdata.unshift({Package: ':packages', _user: universe, ref: '/packages'});
    pkgdata.unshift({Package: ':registry', _user: universe, ref: '/'});
    pkgdata.unshift({Package: ':name', _user: universe, ref: '/'});
    pkgdata = pkgdata.map(function(x){
      return Object.assign(x, {
        badge: `https://${x._user}.r-universe.dev/badges/${x.Package}`,
        link: `https://${x._user}.r-universe.dev${x.ref || '/' + x.Package}`
      });
    });
    res.render('badges', {
      pkgdata: pkgdata
    });
  });
});

router.get("/apis", function(req, res, next){
  var fields = ['_datasets', '_registered'];
  return get_universe_packages(res.locals.universe, fields, true).then(function(pkgdata){
    res.render('apis', {
      pkgdata: pkgdata.filter(x => x._registered).sort(sort_by_package)
    });
  });
});

router.get("/datasets", function(req, res, next){
  var fields = ['_datasets', '_registered'];
  return get_universe_packages(res.locals.universe, fields, true).then(function(pkgdata){
    res.render('datasets', {
      pkgdata: pkgdata.filter(x => x._registered).sort(sort_by_package)
    });
  })
});

router.get("/contributors", function(req, res, next){
  res.render('contributors', {});
});

router.get("/articles", function(req, res, next){
  return get_universe_vignettes(res.locals.universe).then(function(articles){
    articles = articles.map(function(x){
      x.host = (x.user !== res.locals.universe) ? `https://${x.user}.r-universe.dev` : "";
      return x;
    }).sort((x,y) => x.vignette.modified > y.vignette.modified ? -1 : 1);
    res.render('articles', {
      format_time_since: format_time_since,
      articles: articles
    });
  });
});

router.get("/articles/:package/:vignette", function(req, res, next){
  return get_package_info(req.params.package, req.universe).then(function(pkgdata){
    var article = pkgdata._vignettes && pkgdata._vignettes.find(x => x.filename == req.params.vignette);
    if(article){
      //do not open pdf files in iframe
      if(article.filename.endsWith("html")){
        pkgdata.format_yymmdd = format_yymmdd;
        pkgdata.article = article;
        pkgdata.universe = pkgdata._user;
        pkgdata.title = article.title;
        res.render('article-iframe', pkgdata);
      } else {
        res.redirect(`https://${pkgdata._user}.r-universe.dev/${pkgdata.Package}/doc/${article.filename}`)
      }
    } else {
      res.status(404).send(`Vignette ${req.params.vignette} not found in ${req.params.package}`)
    }
  });
});

router.get("/sitemap_index.xml", function(req, res, next){
  var universe = res.locals.universe;
  var fields = ['Package', '_user', '_registered'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._registered).sort(sort_by_package);
    res.type('application/xml').render('sitemap', {
      pkgdata: pkgdata
    });
  });
});

router.get("/feed.xml", function(req, res, next){
  var universe = res.locals.universe;
  var fields = ['Package', 'Version', 'Description', '_user', '_maintainer',
    '_status', '_upstream', '_buildurl', '_vignettes', '_commit.time', '_registered'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._registered).sort(sort_by_date);
    if(pkgdata.length == 0){
      return res.status(404).send("no packages found for this user;");
    } else {
      res.type('application/xml').render('feed', {
        convert_date: convert_date,
        pkgdata: pkgdata
      });
    }
  });
});

router.get('/robots.txt', function(req, res, next) {
  res.type('text/plain').send(`Sitemap: https://${res.locals.universe}.r-universe.dev/sitemap_index.xml\n`);
});

router.get('/sitemap{s}.*ext', function(req, res, next) {
  res.redirect(301, '/sitemap_index.xml')
});

router.get('/index.xml', function(req, res, next) {
  res.redirect(301, '/feed.xml')
});

router.get('/ads.txt', function(req, res, next) {
  res.status(404).send("No thanks");
});

export default router;
