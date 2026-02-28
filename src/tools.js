import {Buffer} from "node:buffer";
import tar from 'tar-stream';
import gunzip from 'gunzip-maybe';
import {load as cheerio_load} from 'cheerio';
import hljs from 'highlight.js';
import createError from 'http-errors';

export const pkgfields = {_id: 1, _type:1, _fileid:1, _dependencies: 1, Filesize: '$_filesize', Distro: '$_distro',
  SHA256: '$_sha256', Package: 1, Version: 1, Depends: 1, Suggests: 1,
  NeedsCompilation: 1, Imports: 1, LinkingTo: 1, Enhances: 1, License_restricts_use: 1,
  OS_type: 1, Priority: 1, Lifcense_is_FOSS: 1, Archs: 1, Path: 1, MD5sum: 1, Built: 1};

export function stream2buffer(stream) {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on("data", (chunk) => _buf.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(_buf)));
    stream.on("error", (err) => reject(err));
  });
}

export function extract_files_from_stream(input, files){
  var output = Array(files.length);
  return new Promise(function(resolve, reject) {
    const gz = gunzip();
    const extract = tar.extract({allowUnknownFormat: true});

    function cleanup() {
      input.destroy();
      gz.destroy();
      extract.destroy();
    }

    function process_entry(header, filestream, next_entry) {
      filestream.on('end', next_entry);
      filestream.on('error', reject);
      var index = files.indexOf(header.name);
      if(index > -1){
        stream2buffer(filestream).then(function(buf){
          output[index] = buf;
        });
      } else {
        filestream.resume();
      }
    }
    function finish_stream(){
      resolve(output);
    }
    function handle_error(err) {
      cleanup();
      reject(err);
    }

    extract
      .on('entry', process_entry)
      .on('finish', finish_stream)
      .on('error', handle_error);

    input.on('error', handle_error);
    gz.on('error', handle_error);

    input.pipe(gz).pipe(extract);
  });
}

export function index_files_from_stream(input){
  let files = [];
  return new Promise(function(resolve, reject) {
    const gz = gunzip();
    const extract = tar.extract({allowUnknownFormat: true});

    function cleanup() {
      input.destroy();
      gz.destroy();
      extract.destroy();
    }

    function process_entry(header, stream, next_entry) {
      stream.on('end', next_entry);
      stream.on('error', reject);
      if(header.size > 0 && header.name.match(/\/.*/)){
        files.push({
          filename: header.name,
          start: extract._buffer.shifted,
          end: extract._buffer.shifted + header.size
        });
      }
      stream.resume();
    }

    function finish_stream(){
      resolve({files: files, remote_package_size: extract._buffer.shifted});
    }

    function handle_error(err){
      if (err.message.includes('Unexpected end') && files.length > 0){
        finish_stream(); //workaround tar-stream error for webr 0.4.2 trailing junk
      } else {
        cleanup();
        reject(err);
      }
    }

    extract
      .on('entry', process_entry)
      .on('finish', finish_stream)
      .on('error', handle_error);

    input.on('error', handle_error);
    gz.on('error', handle_error);

    input.pipe(gz).pipe(extract);
  });
}

export function cheerio_hljs(html, pkgname, universe){
  const $ = cheerio_load(html, null, false);
  const mentions_universe = html.includes(`${universe}.r-universe.dev`);
  $('code[class^="language-"]').each(function(i, el){
    try { //hljs errors for unsupported languages
      var el = $(el)
      var lang = el.attr('class').substring(9).replace(/{(.*)}/, '$1').trim();
      var input = el.text();
      if(!mentions_universe){
        var matcher = new RegExp(`([a-z]+::)?(install_github|pak|pkg_install)\\(.${universe}/${pkgname}.\\)`, "i");
        input = input.replace(matcher, `# $&\ninstall.packages("${pkgname}", repos = c('https://${universe}.r-universe.dev', 'https://cloud.r-project.org'))`);
      }
      var out = hljs.highlight(input, {language: lang}).value;
      el.addClass("hljs").empty().append(out);
    } catch (e) { /*console.log(e)*/}
  });
  return $.html();
}

export function cheerio_page(html, page, pkgname, universe){
  const $ = cheerio_load(html, null, false);
  const el = $(`#${page.replace(".", "\\.")}`);
  el.find(".help-page-title").replaceWith(el.find(".help-page-title h2"));
  el.find('a').each(function(i, elm) {
    var link = $(this).attr("href");
    if(link && link.charAt(0) == '#'){
      $(this).attr("href", `https://${universe}.r-universe.dev/${pkgname}/doc/manual.html` + link);
    }
  });
  el.find('hr').remove();
  return el.html();
}

export function fetch_github(url, opt = {}){
  if(process.env.REBUILD_TOKEN){
    opt.headers = opt.headers || {'Authorization': 'token ' + process.env.REBUILD_TOKEN};
  }
  return fetch(url, opt).then(function(response){
    return response.json().catch(e => response.text()).then(function(data){
      if (!response.ok) {
        throw createError(response.status, `GitHub API returned HTTP ${response.status}: ${data.message || data}`);
      }
      return data;
    });
  });
}

export function trigger_rebuild(run_path){
  const url = `https://api.github.com/repos/${run_path}/rerun-failed-jobs`;
  return fetch_github(url, {
    method: 'POST'
  });
}

export function trigger_sync(user){
  const url = `https://api.github.com/repos/r-universe/${user}/actions/workflows/sync.yml/dispatches`;
  return fetch_github(url, {
    method: 'POST',
    body: JSON.stringify({ref: 'master'}),
  });
}

export function get_submodule_hash(user, submodule){
  const url = `https://api.github.com/repos/r-universe/${user}/git/trees/HEAD`
  return fetch_github(url).then(function(data){
    var info = data.tree.find(file => file.path == submodule);
    if(info && info.sha){
      return info.sha;
    }
  });
}

export function get_registry_info(user){
  const url = 'https://api.github.com/repos/r-universe/' + user + '/actions/workflows/sync.yml/runs?per_page=1&status=completed';
  return fetch_github(url);
}

function dep_to_string(x){
  if(x.package && x.version){
    return `${x.package} (${x.version})`;
  } else {
    return x.package || x;
  }
}

function unpack_deps(x){
  var alldeps = x['_dependencies'] || [];
  var deptypes = new Set(alldeps.map(dep => dep.role));
  deptypes.forEach(function(type){
    x[type] = alldeps.filter(dep => dep.role == type).map(dep_to_string).join(", ");
  });
  delete x['_dependencies'];
  return x;
}

export function doc_to_dcf(doc, use_sha_file = true){
  //this clones 'doc' and then deletes some fields
  const { _id, _fileid, _type, _sysdeps, Distro, MD5sum, ...x } = unpack_deps(doc);
  //if(_type == 'linux'){
  //  x.Platform = 'x86_64-pc-linux-gnu' //pak likes this to identify binaries
  //}
  //x.MD5sum = MD5sum; //workaround for https://github.com/r-lib/pak/issues/733
  if(use_sha_file){
    x.File = `sha256-${x.SHA256}`;
  }
  //x.DownloadURL = `https://cdn.r-universe.dev/${x.SHA256}`; //try to help pak
  if(Array.isArray(_sysdeps)){
    x.SystemRequirements = Array.from(new Set(_sysdeps.map(x => x.name))).join(', ');
    var libnames = _sysdeps.filter(x => x.headers).map(x => x.shlib || x.headers.replace("-dev", ""));
    if(libnames && libnames.length){
      x.SystemRequirements = `${x.SystemRequirements} (${Array.from(new Set(libnames)).join(' ')})`;
    }
  }
  let keys = Object.keys(x);
  return keys.map(function(key){
    let val = x[key];
    if(key == 'Built'){
      val = "R " + Object.values(val).join("; ");
    } else if(typeof val === 'object') {
      val = JSON.stringify(val)
    }
    return key + ": " + val.toString().replace(/\s/gi, ' ');
  }).join("\n") + "\n\n";
}

export function doc_to_paths(doc){
  var type = doc._type;
  if(type == 'src'){
    return [`src/contrib/${doc.Package}_${doc.Version}.tar.gz`];
  }
  var built = doc.Built && doc.Built.R && doc.Built.R.substring(0,3);
  if(type == 'win'){
    return [`bin/windows/contrib/${built}/${doc.Package}_${doc.Version}.zip`];
  }
  if(type == 'mac'){
    var distro = built < "4.6" ? "big-sur" : "sonoma";
    var intel = `bin/macosx/big-sur-x86_64/contrib/${built}/${doc.Package}_${doc.Version}.tgz`;
    var arm = `bin/macosx/${distro}-arm64/contrib/${built}/${doc.Package}_${doc.Version}.tgz`;
    if(doc.Built.Platform){
      return [doc.Built.Platform.match("x86_64") ? intel : arm];
    } else {
      return [intel, arm];
    }
  }
  if(type == 'linux'){
    var distro = doc._distro || doc.Distro || 'linux';
    var intel = `bin/linux/${distro}-x86_64/${built}/src/contrib/${doc.Package}_${doc.Version}.tar.gz`;
    var arm = `bin/linux/${distro}-aarch64/${built}/src/contrib/${doc.Package}_${doc.Version}.tar.gz`;
    if(doc.Built.Platform){
      return [doc.Built.Platform.match("x86_64") ? intel : arm];
    } else {
      return [intel, arm];
    }
  }
  if(type == 'wasm'){
    return [`bin/emscripten/contrib/${built}/${doc.Package}_${doc.Version}.tgz`];
  }
  throw `Unsupported type: ${type}`;
}

export function check_to_color(check, icons = true){
  switch (check || "") {
    case 'ERROR':
    case 'FAIL':
      return 'text-danger';
    case 'WARNING':
      return 'text-warning';
    case 'NOTE':
      return icons ? 'text-success' : 'text-primary';
    case 'OK':
      return icons ? 'text-success' : 'text-secondary';
    default:
      return 'text-dark';
  }
}

export function job_link(job){
  if(!job.job) return '..';
  if(job.check == 'WARNING' || job.check == 'NOTE'){
    var config = job.config || "";
    if(config.includes('bioc'))
      return `${job.job}#step:5:1`;
    if(config.startsWith('win') || config.startsWith('mac') || config.startsWith('linux'))
      return `${job.job}#step:6:1`;
  }
  return job.job;
}

function get_cran_url(path){
  var mirror1 = `https://cloud.r-project.org/${path}`;
  var mirror2 = `http://cran.r-project.org/${path}`;
  return fetch(mirror1).then(function(res){
    if(res.status == 200 || res.status == 404){
      return res;
    }
    throw("Unexpected response from cran mirror; trying fallback");
  }).catch(function(){
    // Fallback when something is wrong with cloud mirror
    return fetch(mirror2);
  });
}

function parse_description(desc){
  var fields = desc.replace(/\n[\t ]+/g, ' ').split("\n")
  var pkg = fields.find(x => x.match(/^Package:/i));
  var version = fields.find(x => x.match(/^Version:/i));
  var date = fields.find(x => x.match(/^Date\/Publication:/i));
  var urls = fields.find(x => x.match(/^URL:/i));
  var bugreports = fields.find(x => x.match(/^BugReports:/i));
  var strings = `${urls} ${bugreports}`.trim().split(/[,\s]+/);
  var urlarray = strings.filter(x => x.match("https?://.*(github|gitlab|bitbucket|codeberg)"))
    .map(x => x.replace('http://', 'https://'))
    .map(x => x.replace(/#.*/, ''));
  return {
    package: pkg ? pkg.substring(9) : "parse failure",
    version: version ? version.substring(9) : "parse failure",
    date: date ? date.substring(18) : "parse failure",
    urls: [...new Set(urlarray.map(x => x.replace(/\/issues$/, "")))]
  }
}

export function get_cran_desc(pkg){
  return get_cran_url(`/web/packages/${pkg}/DESCRIPTION`).then(function(response){
    if (response.ok) {
      return response.text().then(parse_description);
    } else if(response.status == 404) {
      return get_cran_url(`/src/contrib/Archive/${pkg}/`).then(function(res2){
        if(res2.ok){
          return {package:pkg, version: "archived"};
        }
        if(res2.status == 404){
          return {package:pkg, version: null};
        }
      });
    }
    throw "Failed to lookup CRAN version";
  });
}

function doc_to_ndjson(x){
  return JSON.stringify(x) + '\n';
}

// Somehow node:stream/promises does not catch input on-error callbacks properly
// so we promisify ourselves. See https://github.com/r-universe-org/help/issues/540
export function cursor_stream(cursor, output, transform, gzip){
  return new Promise(function(resolve, reject) {
    var input = cursor.stream({transform: transform}).on('error', reject);
    if(gzip){
      input = input.pipe(zlib.createGzip()).on('error', reject);
    }
    input.pipe(output).on('finish', resolve).on('error', reject);
  });
}

export function send_results(cursor, res, stream = false, transform = (x) => x){
  //We only use hasNext() to catch broken queries and promisify response
  return cursor.hasNext().then(function(has_next){
    if(stream){
      return cursor_stream(cursor, res.type('text/plain'), doc => doc_to_ndjson(transform(doc)));
    } else {
      return cursor.toArray().then(function(out){
        return res.send(out.filter(x => x).map(transform));
      });
    }
  });
}

/* NB: regex queries are slow because not indexable! */
export function build_query(query, str){
  function substitute(name, field, insensitive, partial){
    var re = new RegExp(`${name}:(\\S*)`, "i"); //the name is insensitive e.g.: "Package:jsonlite"
    var found = str.match(re);
    if(found && !found[1]){
      throw createError(400, `Invalid search query: "${name}:" is followed by whitespace`);
    }
    if(found && found[1]){
      var search = found[1];
      if(insensitive || partial){
        search = search.replaceAll("+", "."); //search for: "author:van+buuren" or "topic:open+data"
        var regex = partial ? search : `^${search}$`;
        var opt = insensitive ? 'i' : '';
        query[field] = {$regex: regex, $options: opt}
      } else if (field == '_nocasepkg'){
        query[field] = search.toLowerCase();
      } else {
        query[field] = search;
      }
      str = str.replace(re, "");
    }
  }
  function match_exact(name, field){
    substitute(name, field)
  }
  function match_insensitive(name, field){
    substitute(name, field, true)
  }
  function match_partial(name, field){
    substitute(name, field, true, true)
  }
  function match_exists(name, field){
    var re = new RegExp(`${name}:(\\S+)`, "i");
    var found = str.match(re);
    if(found && found[1]){
      var findfield = found[1].toLowerCase(); //GH logins are normalized to lowercase
      query[`${field}.${findfield}`] = { $exists: true };
      str = str.replace(re, "");
    }
  }
  match_partial('author', 'Author');
  match_partial('maintainer', 'Maintainer');
  match_exact('needs', '_rundeps');
  match_exact('package', '_nocasepkg'); //always case insenstive
  match_exact('contributor', '_contributors.user');
  match_exact('topic', '_topics');
  match_exact('exports', '_exports');
  match_exact('owner', '_owner');
  match_exact('user', '_user');
  match_exact('fileid', '_fileid')
  match_exact('universe', '_universes');
  match_partial('data', '_datasets.title');
  str = str.trim();
  var unknown = str.match("(\\S+):(\\S+)");
  if(unknown && unknown[1]){
    throw createError(400, `Invalid search query: "${unknown[1]}:" is not a supported field.`);
  }
  if(str){
    query['$text'] = { $search: str, $caseSensitive: false};
  }
}
