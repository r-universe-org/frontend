import express from 'express';
import url from 'node:url';
import {get_package_info} from '../src/db.js';
const router = express.Router();

function avatar_url(login, size){
  if(size){
    var param = `?size=${size}`;
  }
  if(typeof login === 'number'){
    return `https://avatars.githubusercontent.com/u/${login}${param}`;
  }
  if(login == 'bioc') login = 'bioconductor';
  if(login.startsWith('gitlab-')) login = 'gitlab';
  if(login.startsWith('bitbucket-')) login = 'atlassian';
  login = login.replace('[bot]', '');
  return `https://r-universe.dev/avatars/${login}.png${param}`;
}

function normalize_authors(str){
  // nested parentheses due to parenthesis inside the comment
  return str.replace(/\s*\([^()]*\)/g, '').replace(/\s*\([\s\S]+?\)/g,"");
}

function sortfun(a,b){
  return a.r < b.r ? 1 : -1;
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

function summarize_checks(pkgdata){
  var results = pkgdata._status.match('suc') ? {OK:1} : {ERROR:1};
  pkgdata._binaries.filter(x => x.check).forEach(function(bin){
    if(!results[bin.check]){
      results[bin.check] = 1
    } else {
      results[bin.check]++;
    }
  });
  var out = [];
  for (const [key, value] of Object.entries(results)) {
    out.push(`${key}: ${value}`)
  }
  return out.join(" ");
}

function group_binaries(x){
  var pkg = x.Package;
  var binaries = x._binaries || [];
  var win = binaries.filter(x => x.os == 'win').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var filename = `${pkg}_${binary.version}.zip`;
    var repo = `r-${build}`;
    var url = `/bin/windows/contrib/${build}/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var mac = binaries.filter(x => x.os == 'mac').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var arch = (binary.arch || "any").replace("aarch64", "arm64");
    var filename = `${pkg}_${binary.version}.tgz`;
    var platform = arch.match("arm64") ? 'big-sur-arm64' : 'big-sur-x86_64';
    var repo = `r-${build}-${arch}`
    var url = `/bin/macosx/${platform}/contrib/${build}/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var linux = binaries.filter(x => x.os == 'linux').map(function(binary){
    var build = binary.r.substring(0,3);
    var distro = binary.distro || "unknown";
    var filename = `${pkg}_${binary.version}.tar.gz`;
    var repo = `r-${build}-${distro}`;
    var url = `/bin/linux/${distro}/${build}/src/contrib/${filename}`;
    return {filename: filename, repo: repo, url: url};
  });
  var wasm = binaries.filter(x => x.os == 'wasm').sort(sortfun).map(function(binary){
    var build = binary.r.substring(0,3);
    var filename = `${pkg}_${binary.version}.tgz`;
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

function help_page_url(pkg, index, topic){
  var chapter = get_topic_page(index, topic);
  if(chapter && chapter.page){
    return `/${pkg}/doc/manual.html#${chapter.page.replace(/.html$/, "")}`;
  }
}

function prepare_datasets(pkgdata){
  if(pkgdata._datasets){
    var lazydata = (pkgdata.LazyData || "").toLowerCase();
    var output = pkgdata._datasets.map(function(x){
      x.help = help_page_url(pkgdata.Package, pkgdata._help, x.name);
      x.title = cleanup_desc(x.title);
      if(lazydata == 'yes' || lazydata == 'true' || (x.file && !x.file.match(/\.R$/i))){
        x.url = `/${pkgdata.Package}/data/${x.name}`;
        x.df = Array.isArray(x.class) && x.class.includes('data.frame');
        x.type = x.class.length && x.class[0] || 'unknown';
      }
      return x;
    }).filter(x => x.help);
    if(output.length){
      return output;
    }
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

//this also works if x was already a json ISO string
function date_to_string(x){
  var date = new Date(x);
  return date.toDateString().substring(4);
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

function description_to_html(txt = ""){
  var html = txt.replaceAll('&', "&amp;").replaceAll('<', "&lt;").replaceAll('>', "&gt;");
  html = html.replaceAll(/&lt;DOI:\s*(\S+)&gt;/ig, '&lt;<a href="https://doi.org/$1" target="_blank">doi:$1</a>&gt;');
  html = html.replaceAll(/&lt;ARXIV:\s*(\S+)&gt;/ig, '&lt;<a href="https://arxiv.org/abs/$1" target="_blank">arxiv:$1</a>&gt;');
  html = html.replaceAll(/&lt;(https?:\S+)&gt;/ig, '&lt;<a href="$1" target="_blank">$1</a>&gt;');
  return html;
}

router.get('/:package', function(req, res, next) {
  return get_package_info(req.params.package, req.universe).then(function(pkgdata){
    pkgdata.url = url;
    pkgdata.format_count = format_count;
    pkgdata.universe = pkgdata._user;
    pkgdata.avatar_url = avatar_url;
    pkgdata.description_to_html = description_to_html;
    pkgdata.date_to_string = date_to_string;
    pkgdata.title = `${pkgdata.Package}: ${pkgdata.Title}`;
    pkgdata.Author = normalize_authors(pkgdata.Author);
    pkgdata._created = date_to_string(pkgdata._created);
    pkgdata._grouped = group_binaries(pkgdata);
    pkgdata._bugtracker = guess_tracker_url(pkgdata);
    pkgdata._sysdeps = filter_sysdeps(pkgdata);
    pkgdata._datasets = prepare_datasets(pkgdata);
    pkgdata._problems = problem_summary(pkgdata);
    pkgdata._lastupdate = pretty_time_diff(pkgdata._commit.time);
    pkgdata._releases = filter_releases(pkgdata);
    pkgdata._contributions = filter_contributions(pkgdata);
    pkgdata._universe_type = pkgdata._userbio.type;
    pkgdata._universe_name = pkgdata._userbio.name;
    pkgdata._universe_bio = pkgdata._userbio.description;
    pkgdata._checks = pkgdata._binaries.filter(x => x.check).sort((x,y) => `${x.r}${x.os}` < `${y.r}${y.os}` ? 1 : -1);
    pkgdata._checksummary = summarize_checks(pkgdata);
    pkgdata._enable_tour = true;
    res.render('pkginfo', pkgdata);
  });
});

router.get('/:package/sitemap.xml', function(req, res, next) {
  return get_package_info(req.params.package, req.universe).then(function(pkgdata){
    const pkg = pkgdata.Package;
    const assets = pkgdata._assets || [];
    const vignettes = pkgdata._vignettes || [];
    const baseurl = `https://${pkgdata._user}.r-universe.dev`;
    const pkgurl = `https://${pkgdata._user}.r-universe.dev/${pkg}`;
    var urls = [
      `${pkgurl}`,
      `${baseurl}/api/packages/${pkg}`,
      `${pkgurl}/${pkg}.pdf`,
      `${pkgurl}/doc/manual.html`
    ];
    if(assets.includes('extra/NEWS.html')){
      urls.push(`${pkgurl}/NEWS`);
    }
    if(assets.includes('extra/NEWS.txt')){
      urls.push(`${pkgurl}/NEWS.txt`);
    }
    if(assets.includes('extra/citation.html')){
      urls.push(`${pkgurl}/citation`);
    }
    if(assets.includes('extra/citation.txt')){
      urls.push(`${pkgurl}/citation.txt`);
    }
    if(assets.includes('extra/citation.cff')){
      urls.push(`${pkgurl}/citation.cff`);
    }
    vignettes.map(function(vignette){
      urls.push(`${pkgurl}/doc/${vignette.source}`);
      urls.push(`${baseurl}/articles/${pkg}/${vignette.filename}`)
    });
    res.type('application/xml').render('sitemap', {urls: urls});
  });
});

router.get("/:package/json", function(req, res, next) {
  res.redirect(301, `/api/packages/${req.params.package}`);
});

router.get('/:package/buildlog', function(req, res, next) {
  return get_package_info(req.params.package, req.universe).then(function(x){
    if(x.failure && x.failure.buildurl){
      res.redirect(x.failure.buildurl);
    } else {
      res.redirect(x._buildurl);
    }
  });
});

export default router;
