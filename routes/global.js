const express = require('express');
const router = express.Router();
const db = require("../src/db.js");

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

router.get("/_global/search", function(req, res, next){
  res.render("global/search");
});

router.get("/_global/activity", function(req, res, next){
  res.render("global/activity");
});

router.get("/_global/builds", function(req, res, next){
  db.get_builds().then(function(packages){
    packages.forEach(function(x){
      var checks = x.runs.filter(run => run.check && run.built.Platform !== 'x86_64-apple-darwin20');
      x.check_icon_html = function(version, type){
        console.log("Looking for: ", version, type)
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
    res.render('global/builds', {packages: packages});
  }).catch(next);
});

router.get("/_global/organizations", function(req, res, next){
  db.get_organizations().then(function(orgs){
    orgs.forEach(function(x){
      x.avatar = x.uuid ? `https://avatars.githubusercontent.com/u/${x.uuid}` : `https://r-universe.dev/avatars/${x.universe}.png`;
    });
    res.render('global/organizations', {orgs: orgs});
  }).catch(next);
});

router.get("/_global/repositories", function(req, res, next){
  db.get_repositories().then(function(repos){
    res.render('global/repositories', {repos: repos, format_yymmdd: format_yymmdd});
  });
});

router.get("/_global/scores", function(req, res, next){
  db.get_scores().then(function(packages){
    res.render('global/scores', {packages: packages});
  });
});

router.get("/_global/sysdeps", function(req, res, next){
  db.get_sysdeps().then(function(sysdeps){
    sysdeps = sysdeps.filter(x => x.library && x.library !== 'c++');
    sysdeps.forEach(function(x){
      x.description = cleanup_sysdep_desc(x.description);
      x.usedby = x.usedby.sort((a,b) => a.package.toLowerCase() < b.package.toLowerCase() ? -1 : 1);
    });
    res.render('global/sysdeps', {sysdeps: sysdeps});
  });
});

router.get("/_global/galaxy", function(req, res, next){
  db.get_organizations().then(function(orgs){
    res.render('global/galaxy', {rnd: rnd, orgs: orgs.slice(0, 250)});
  }).catch(next);
});

module.exports = router;
