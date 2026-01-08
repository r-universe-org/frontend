import express from 'express';
import {get_builds, get_organizations, get_repositories, get_articles, get_scores, get_sysdeps, get_datasets, mongo_indexes, find_cran_package} from '../src/db.js';
import {check_to_color, get_cran_desc} from '../src/tools.js';
const router = express.Router();

function rnd(max){
  return Math.floor(Math.random() * max);
}

function format_yymmdd(x){
  const date = new Date(x || NaN);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cleanup_sysdep_desc(str){
  if(!str) return "";
  var str = str.charAt(0).toUpperCase() + str.slice(1);
  return str.replace(/\(.*\)$/, '').replace('SASL -', 'SASL').replace(/[-,]+ .*(shared|runtime|binary|library|legacy|precision|quantum).*$/i, '');
}

function os_icon(type){
  switch (type) {
    case 'win':
      return 'fa-windows';
    case 'linux':
      return 'fa-linux';
    case 'mac':
      return 'fa-apple';
    default:
      return 'fa-question';
  }
}

function unsplat(x){
  if(!x || !x.length) return "";
  if(Array.isArray(x)){
    return x.map(val => `/${val}`).join("");
  }
  return x;
}

router.get("/search", function(req, res, next){
  res.render("global/search", {
    title: "R-universe - browse and search R packages"
  });
});

router.get("/activity", function(req, res, next){
  res.render("global/activity", {
    title: "R-universe - leaderboard"
  });
});

router.get("/builds", function(req, res, next){
  return get_builds().then(function(packages){
    packages.forEach(function(x){
      var checks = x.runs.filter(run => run.check && run.built.Platform !== 'x86_64-apple-darwin20');
      x.check_icon_html = function(version, type){
        var bin = checks.find(run => run.built.R.startsWith(version) && run.type == type);
        if(bin){
          return `<i class="fa-fw fab ${os_icon(bin.type)} ${check_to_color(bin.check)}"></i>`
        } else if(type != 'linux' && x.user == 'cran'){
          return '<i class="fa-fw fa-solid fa-minus"></i>';
        } else {
          return '<i class="fa-fw fa-solid fa-xmark text-danger"></i>';
        }
      };
      x.date = format_yymmdd(x.timestamp * 1000);
      x.src = x.runs.find(run => run.type == 'src') || {};
      x.failure = x.runs.find(run => run.type == 'failure');
    });
    res.render('global/builds', {
      title: "R-universe - recent builds",
      packages: packages
    });
  })
});

router.get("/organizations", function(req, res, next){
  return get_organizations().then(function(orgs){
    orgs.forEach(function(x){
      x.avatar = x.uuid ? `https://avatars.githubusercontent.com/u/${x.uuid}` : `https://r-universe.dev/avatars/${x.universe}.png`;
    });
    res.render('global/organizations', {
      title: "R-universe - community",
      orgs: orgs
    });
  });
});

router.get("/repositories", function(req, res, next){
  return get_repositories().then(function(repos){
    res.render('global/repositories', {
      title: "R-universe - browse repositories",
      repos: repos,
      format_yymmdd: format_yymmdd
    });
  });
});

router.get("/articles", function(req, res, next){
  return get_articles().then(function(articles){
    res.render('global/articles', {
      title: "R-universe - browse articles",
      articles: articles,
      format_yymmdd: format_yymmdd
    });
  });
});

router.get("/datasets", function(req, res, next){
  return get_datasets().then(function(datasets){
    res.render('global/datasets', {
      title: "R-universe - browse datasets",
      datasets: datasets
    });
  });
});

router.get("/packages", function(req, res, next){
  return get_scores().then(function(packages){
    res.render('global/packages', {
      title: "R-universe - top packages",
      packages: packages
    });
  });
});

router.get("/sysdeps", function(req, res, next){
  return get_sysdeps().then(function(sysdeps){
    sysdeps = sysdeps.filter(x => x.library && x.library !== 'c++');
    sysdeps.forEach(function(x){
      x.description = cleanup_sysdep_desc(x.description);
      x.usedby = x.usedby.sort((a,b) => a.package.toLowerCase() < b.package.toLowerCase() ? -1 : 1);
    });
    res.render('global/sysdeps', {
      title: "R-universe - system libraries",
      sysdeps: sysdeps
    });
  });
});

router.get("/galaxy", function(req, res, next){
  return get_organizations().then(function(orgs){
    res.render('global/galaxy', {rnd: rnd, orgs: orgs.slice(0, 250)});
  });
});

router.get("/welcome", function(req, res, next){
  res.render('global/welcome');
});

router.get("/sitemap_index.xml", function(req, res, next){
  return get_scores().then(function(packages){
    res.type('application/xml').render('sitemap-index', {
      pkgdata: packages
    });
  });
});

router.get('/sitemap{s}.*ext', function(req, res, next) {
  res.redirect(301, '/sitemap_index.xml')
});

router.get(["/index.xml", "/feed.xml"], function(req, res, next){
  res.status(404).send("Global feeds are no longer supported.");
});


/* previously under /shared */
router.get('/condastatus/:package', function(req, res, next) {
  return fetch(`https://api.anaconda.org/package/conda-forge/r-${req.params.package}`).then(function(response){
    res.set('Cache-Control', 'max-age=3600, public');
    if (response.ok) {
      return response.json().then(function(conda){
        return res.send({
          name: conda.full_name, url: conda.html_url, version: conda.latest_version, date: conda.modified_at
        });
      });
    } else { //always send HTTP 200 to ensure caching
      res.send({error: "Failed"});
    }
  });
});

router.get('/mongostatus', function(req, res, next) {
  return mongo_indexes().then(function(indexes){
    var out = {indexes: indexes}
    res.send(out);
  });
});

router.get('/cranstatus/:package', function(req, res, next) {
  return get_cran_desc(req.params.package).then(function(info){
    return res.set('Cache-Control', 'max-age=3600, public').send(info);
  });
});

router.get('/redirect/:package{/*path}', function(req, res, next) {
  return find_cran_package(req.params.package).then(function(x){
    var path = req.headers.host == 'docs.cran.dev' ? '/doc/manual.html' : unsplat(req.params.path);
    res.redirect(`https://${x._realowner || 'cran'}.r-universe.dev/${x.Package}${path}`);
  });
});

/* Prevent fall-through */
router.get('/*any', function(req, res, next){
  res.status(404).send("Page not found.");
});

export default router;
