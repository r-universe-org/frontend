import express from 'express';
import {get_builds, get_organizations, get_repositories, get_articles, get_scores, get_sysdeps, get_datasets} from '../src/db.js';
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

function check_to_color(check){
  switch (check) {
    case 'ERROR':
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

/* Prevent fall-through */
router.get('/*any', function(req, res, next){
  res.status(404).send("Page not found.");
});

export default router;
