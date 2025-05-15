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
    var extract = tar.extract({allowUnknownFormat: true})
      .on('entry', process_entry)
      .on('finish', finish_stream)
      .on('error', reject);
    input.on('error', reject).pipe(gunzip()).pipe(extract);
  });
}

export function index_files_from_stream(input){
  let files = [];
  let extract = tar.extract({allowUnknownFormat: true});
  return new Promise(function(resolve, reject) {
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

    var extract = tar.extract({allowUnknownFormat: true})
      .on('entry', process_entry)
      .on('finish', finish_stream)
      .on('error', function(err){
        if (err.message.includes('Unexpected end') && files.length > 0){
          finish_stream(); //workaround tar-stream error for webr 0.4.2 trailing junk
        } else {
          reject(err);
        }
      });
    input.on('error', reject).pipe(gunzip()).pipe(extract);
  });
}

export function cheerio_hljs(html, pkgname, universe){
  const $ = cheerio_load(html, null, false);
  $('code[class^="language-"]').each(function(i, el){
    try { //hljs errors for unsupported languages
      var el = $(el)
      var lang = el.attr('class').substring(9).replace(/{(.*)}/, '$1').trim();
      var matcher = new RegExp(`([a-z]+::)?(install_github|pak|pkg_install)\\(.${universe}/${pkgname}.\\)`, "i");
      var input = el.text().replace(matcher, `# $&\ninstall.packages("${pkgname}", repos = c('https://${universe}.r-universe.dev', 'https://cloud.r-project.org'))`)
      var out = hljs.highlight(input, {language: lang}).value
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

export function doc_to_dcf(doc){
  //this clones 'doc' and then deletes some fields
  const { _id, _fileid, _type, _sysdeps, Distro, MD5sum, ...x } = unpack_deps(doc);
  //if(_type == 'linux'){
  //  x.Platform = 'x86_64-pc-linux-gnu' //pak likes this to identify binaries
  //}
  //x.MD5sum = MD5sum; //workaround for https://github.com/r-lib/pak/issues/733
  x.File = `sha256-${x.SHA256}`;
  //x.DownloadURL = `https://cdn.r-universe.dev/${x.SHA256}`; //try to help pak
  if(Array.isArray(_sysdeps)){
    x.SystemRequirements = Array.from(new Set(_sysdeps.map(x => x.name))).join(', ');
    var headers = Array.from(new Set(_sysdeps.filter(x => x.headers).map(x => x.headers))).join(' ');
    if(headers){
      x.SystemRequirements = `${x.SystemRequirements} (${headers})`;
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
    var intel = `bin/macosx/big-sur-x86_64/contrib/${built}/${doc.Package}_${doc.Version}.tgz`;
    var arm = `bin/macosx/big-sur-arm64/contrib/${built}/${doc.Package}_${doc.Version}.tgz`;
    if(doc.Built.Platform){
      return [doc.Built.Platform.match("x86_64") ? intel : arm];
    } else {
      return [intel, arm];
    }
  }
  if(type == 'linux'){
    var distro = doc._distro || doc.Distro || 'linux';
    return [`bin/linux/${distro}/${built}/src/contrib/${doc.Package}_${doc.Version}.tar.gz`];
  }
  if(type == 'wasm'){
    return [`bin/emscripten/contrib/${built}/${doc.Package}_${doc.Version}.tgz`];
  }
  throw `Unsupported type: ${type}`;
}

export function check_to_color(check){
  switch (check || "") {
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
