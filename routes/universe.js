import express from 'express';
import url from 'node:url';
import createError from 'http-errors';
import {get_universe_packages, get_universe_s3_index, get_universe_vignettes, get_package_info,
        get_universe_contributors, get_universe_contributions, get_all_universes} from '../src/db.js';
const router = express.Router();

function check_to_color(job){
  var check = job.check || "";
  switch (check) {
    case 'ERROR':
    case 'FAIL':
      return 'text-danger';
    case 'WARNING':
      return 'text-warning';
    case 'NOTE':
      return 'text-success';
    case 'OK':
      return 'text-success';
    default:
      return 'text-dark';
  }
}

function os_icon(job){
  var config = job.config || "";
  if(job.check == 'FAIL')
    return 'fa fa-xmark';
  if(config.includes('pkgdown'))
    return 'fa fa-book';
  if(config.includes('source'))
    return 'fa fa-box-archive';
  if(config.startsWith('win'))
    return 'fab fa-windows';
  if(config.startsWith('linux'))
    return 'fab fa-linux';
  if(config.startsWith('mac'))
    return 'fab fa-apple';
  if(config.startsWith('wasm'))
    return 'fab fa-chrome';
  return 'fa-question';
}


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

function all_ok(pkg){
  // this now includes 'pkgdown' and 'source' jobs
  for (const job of pkg._jobs || []) {
    if((job.check == 'FAIL' || job.check == 'ERROR') && !job.config.includes('wasm')){
      return false;
    }
  }
  return true;
}

function build_url(x){
  return x._failure ? x._failure.buildurl : x._buildurl;
}

function retry_url(x){
  var retrytype = x._failure ? 'failure' : 'src';
  var retryversion = x._failure ? x._failure.version : x.Version;
  return `https://${x._user}.r-universe.dev/api/packages/${x.Package}/${retryversion}/${retrytype}`;
}

function get_contrib_data(user, max = 20){
  const p1 = get_universe_contributors(user, 1000);
  const p2 = get_universe_contributions(user, 1000);
  const p3 = get_all_universes();
  return Promise.all([p1, p2, p3]).then(function([contributors, contributions, universes]){
    var data = contributors.map(function(x){
      x.contributions = 0;
      x.packages = [];
      return x;
    });
    contributions.forEach(function(x, i){
      x.maintainers.forEach(function(maintainer){
        var rec = data.find(y => y.login == maintainer);
        if(!rec){
          rec = {login: maintainer, total: 0, contributions: 0, repos: [], packages: []};
          data.push(rec);
        }
        rec.contributions = rec.contributions + x.contributions;
        rec.packages = rec.packages.concat(x.packages);
      });
    });
    return data.filter(function(x){
      var skiplist = [user, 'pachadotdev'];
      return universes.includes(x.login) && !skiplist.includes(x.login);
    }).sort(function(x,y){
      return (x.total + x.contributions > y.total + y.contributions) ? -1 : 1}
    ).slice(0, max);
  });
}

//See https://github.com/r-universe-org/help/issues/574
function send_s3_list(req, res){
  var universe = res.locals.universe;
  var delimiter = req.query['delimiter'];
  var start_after = req.query['start-after'] || req.query['continuation-token'];
  var max_keys = parseInt(req.query['max-keys'] || 1000);
  var prefix = req.query['prefix'] || "";
  return get_universe_s3_index(universe, prefix, start_after).then(function(files){
    if(delimiter){
      var subpaths = files.map(x => x.Key.substring(prefix.length));
      var dirnames = subpaths.filter(x => x.includes('/')).map(x => prefix + x.split('/')[0]);
      var commonprefixes = [...new Set(dirnames)];
      files = files.filter(x => x.Key.substring(prefix.length).includes('/') == false);
    } else {
       var commonprefixes = [];
    }
    var IsTruncated = files.length > max_keys;
    files = files.slice(0, max_keys);
    return res.type('application/xml').render('S3List', {
      Prefix: prefix,
      MaxKeys: max_keys,
      IsTruncated: IsTruncated,
      NextContinuationToken: IsTruncated ? files[files.length -1].Key : undefined,
      commonprefixes: commonprefixes,
      files: files
    });
  });
}

router.get('/', function(req, res, next) {
  //res.render('index');
  if(req.query['x-id'] == 'ListBuckets'){
    throw createError(400, "Please use virtual-hosted-style bucket on r-universe.dev TLD");
  }
  if(req.query['list-type']){
    return send_s3_list(req, res);
  }
  res.set('Cache-control', 'private, max-age=604800'); // Vary does not work in cloudflare currently
  const accept = req.headers['accept'];
  if(accept && accept.includes('html')){
    /* Langing page (TODO) */
    res.redirect(`/builds`);
  } else {
    res.send(`Welcome to the ${res.locals.universe} universe!`);
  }
});

router.get('/builds', function(req, res, next) {
  var fields = ['Package', 'Version', 'OS_type', '_user', '_owner', '_commit.time', '_commit.id',
    '_maintainer', '_upstream', '_registered', '_created', '_jobs',
    '_pkgdocs', '_status', '_buildurl', '_failure'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    pkgdata.forEach(function(row){
      row.check_icon_html = function(target){
        var job = (row._jobs || []).find(x => x.config.includes(target));
        if(job){
          return `<a href="${row._buildurl}/job/${job.job}" target="_blank"><i class="grow-on-over fa-fw ${os_icon(job)} ${check_to_color(job)}"></i></a>`;
        } else if(!target.includes('linux') && row.user == 'cran'){
          return '<i class="grow-on-over fa-fw fa-solid fa-minus"></i>';
        } else {
          return `<a href="${row._buildurl}"><i class="grow-on-over fa-fw fa-solid fa-xmark text-danger"></i></a>`;
        }
      };
    });
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
    pkgdata.unshift({meta: 'datasets', _user: universe, link: '/datasets'});
    pkgdata.unshift({meta: 'articles', _user: universe, link: '/articles'});
    pkgdata.unshift({meta: 'packages', _user: universe, link: '/packages'});
    if(pkgdata.find(x => (x.Package && x._user === universe))){
      //hide badge for maintainer-only universes
      pkgdata.unshift({meta: 'registry', _user: universe, link: '/'});
    }
    pkgdata.unshift({meta: 'name', _user: universe, link: '/'});
    pkgdata = pkgdata.map(function(x){
      if(x.Package){
        x.badge = `https://${x._user}.r-universe.dev/${x.Package}/badges/version` ;
        x.link = `https://${x._user}.r-universe.dev/${x.Package}`;
      } else {
        x.badge = `https://${x._user}.r-universe.dev/badges/:${x.meta}`;
        x.link = `https://${x._user}.r-universe.dev${x.link}`;
      }
      return x;
    });
    res.render('badges', {
      pkgdata: pkgdata
    });
  });
});

router.get("/apis", function(req, res, next){
  var fields = ['_datasets', '_registered'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    res.render('apis', {
      pkgdata: pkgdata.filter(x => x._registered).sort(sort_by_package)
    });
  });
});

router.get("/datasets", function(req, res, next){
  var fields = ['_datasets', '_registered'];
  return get_universe_packages(res.locals.universe, fields).then(function(pkgdata){
    res.render('datasets', {
      pkgdata: pkgdata.filter(x => x._registered).sort(sort_by_package)
    });
  })
});

router.get("/contributors", function(req, res, next){
  return get_contrib_data(res.locals.universe).then(function(contributors){
    res.render('contributors', {contributors: contributors});
  });
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

router.get("/articles/:package", function(req, res, next){
  res.redirect('/articles');
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
    res.type('application/xml').render('sitemap-index', {
      pkgdata: pkgdata.map(x => ({universe: x._user, package: x.Package}))
    });
  });
});

router.get("/feed.xml", function(req, res, next){
  var universe = res.locals.universe;
  var limit = parseInt(req.query.limit) || 50;
  var fields = ['Package', 'Version', 'Description', '_user', '_maintainer',
    '_status', '_upstream', '_buildurl', '_vignettes', '_commit.time', '_registered'];
  return get_universe_packages(res.locals.universe, fields, limit).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._registered && x._type == 'src').sort(sort_by_date);
    res.type('application/xml').render('feed', {
      convert_date: convert_date,
      pkgdata: pkgdata
    });
  });
});

router.get('/robots.txt', function(req, res, next) {
  return get_universe_packages(res.locals.universe, ['Package', '_datasets']).then(function(pkgdata){
    pkgdata = pkgdata.filter(x => x._datasets);
    var str = pkgdata.map(x => `Disallow: /${x.Package}/data/`);
    str.unshift('User-agent: *');
    str.push("");
    str.push(`Sitemap: https://${res.locals.universe}.r-universe.dev/sitemap_index.xml`);
    res.type('text/plain').send(str.join('\n'));
  });
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
