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

function normalize_authors(str){
  // nested parentheses due to parenthesis inside the comment
  return str.replace(/\s*\([^()]*\)/g, '').replace(/\s*\([\s\S]+?\)/g,"");
}

function sortfun(a,b){
  return a.r < b.r ? 1 : -1;
}

function group_binaries(x){
  var package = x.Package;
  var binaries = x._binaries || [];
  var win = binaries.filter(x => x.os == 'win').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var filename = `${package}_${binary.version}.zip`;
    var repo = `r-${build}`;
    var url = `/bin/windows/contrib/${build}/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var mac = binaries.filter(x => x.os == 'mac').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var arch = (binary.arch || "any").replace("aarch64", "arm64");
    var filename = `${package}_${binary.version}.tgz`;
    var platform = arch.match("arm64") ? 'big-sur-arm64' : 'big-sur-x86_64';
    var repo = `r-${build}-${arch}`
    var url = `/bin/macosx/${platform}/contrib/${build}/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var linux = binaries.filter(x => x.os == 'linux').map(function(binary){
    var build = binary.r.substring(0,3);
    var distro = binary.distro || "unknown";
    var filename = `${package}_${binary.version}.tar.gz`;
    var repo = `r-${build}-${distro}`;
    var url = `/bin/linux/${distro}/${build}/src/contrib/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var wasm = binaries.filter(x => x.os == 'wasm').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var filename = `${package}_${binary.version}.tgz`;
    var repo = `r-${build}-emscripten`;
    var url = `/bin/emscripten/contrib/${build}/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  return {win: win, mac: mac, linux: linux, wasm: wasm};
}

function guess_tracker_url(src){
  var devurl = src._devurl || src._upstream;
  var upstream = devurl.replace('https://github.com/r-forge/', 'https://r-forge.r-project.org/projects/');
  if(upstream.match("github.com/(bioc|cran)/") || upstream.match("git.bioconductor.org/packages/"))
    return ""; //these are mirror urls
  if(upstream.match("github.com")){
    return upstream + '/issues';
  }
  return upstream;
}

function cleanup_desc(str){
  if(!str) return "";
  var str = str.charAt(0).toUpperCase() + str.slice(1);
  return str.replace(/\(.*\)$/, '').replace('SASL -', 'SASL').replace(/[-,]+ .*(shared|runtime|binary|library|legacy|precision|quantum).*$/i, '');
}

function filter_sysdeps(pkgdata){
  var sysdeps = pkgdata._sysdeps;
  var out = {};
  if(sysdeps && sysdeps.length){
    sysdeps.forEach(function(x){
      if(x.source != 'glibc' && !out[x.name]){
        x.description = cleanup_desc(x.description);
        out[x.name] = x;
      }
    });
    var values = Object.values(out);
    return values.length ? values : null;
  }
}

function filter_releases(pkgdata){
  if(pkgdata._releases){
    var cutoff = new Date(new Date() - 365*24*60*60*1000);
    return pkgdata._releases.filter((x) => new Date(x.date) > cutoff);
  }
}

function filter_contributions(pkgdata, max = 12){
  if(pkgdata._contributions){
    return Object.fromEntries(Object.entries(pkgdata._contributions).slice(0,max))
  }
}

function get_topic_page(index, topic){
  if(!topic || !index || !index.length) return;
  return index.find(function(x) {return Array.isArray(x.topics) && x.topics.includes(topic)});
}

function help_page_url(package, index, topic){
  var chapter = get_topic_page(index, topic);
  if(chapter && chapter.page){
    return `/${package}/doc/manual.html#${chapter.page.replace(/.html$/, "")}`;
  }
}

function prepare_datasets(pkgdata){
  if(pkgdata._datasets){
    var lazydata = (pkgdata.LazyData || "").toLowerCase();
    return pkgdata._datasets.map(function(x){
      x.help = help_page_url(pkgdata.Package, pkgdata._help, x.name);
      x.title = cleanup_desc(x.title);
      if(lazydata == 'yes' || lazydata == 'true' || (x.file && !x.file.match(/\.R$/i))){
        x.url = `/${pkgdata.Package}/data/${x.name}`;
        x.df = Array.isArray(x.class) && x.class.includes('data.frame');
        x.type = x.class.length && x.class[0] || 'unknown';
      }
      return x;
    }).filter(x => x.help);
  }
}

function fail_status(x){
  return x && ["success", "skipped"].includes(x) == false;
}

function problem_summary(src){
  var os_type = src.OS_type
  var docfail = src._status != 'success';
  var winfail = fail_status(src._winbinary) && os_type != 'unix';
  var macfail = fail_status(src._macbinary) && os_type != 'windows';
  if(docfail || winfail || macfail){
    var problems = [];
    if(docfail) problems.push('Vignettes');
    if(winfail) problems.push('Windows');
    if(macfail) problems.push('MacOS');
    return problems;
  }
}

function pretty_time_diff(ts){
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

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'R-universe' });
});

router.get('/favicon.ico', function(req, res, next) {
  res.status(404).send("No favicon yet")
});

router.get('/:package', function(req, res, next) {
  return get_json(`https://cran.dev/${req.params.package}/json`).then(function(pkgdata){
    pkgdata.title = `${pkgdata.Package}: ${pkgdata.Title}`;
    pkgdata.Author = normalize_authors( pkgdata.Author);
    pkgdata._grouped = group_binaries(pkgdata);
    pkgdata._bugtracker = guess_tracker_url(pkgdata);
    pkgdata._sysdeps = filter_sysdeps(pkgdata);
    pkgdata._datasets = prepare_datasets(pkgdata);
    pkgdata._problems = problem_summary(pkgdata);
    pkgdata._lastupdate = pretty_time_diff(pkgdata._commit.time);
    pkgdata._releases = filter_releases(pkgdata);
    pkgdata._contributions = filter_contributions(pkgdata);
    res.render('pkginfo', pkgdata);
  }).catch(next);
});

module.exports = router;
