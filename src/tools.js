import {Buffer} from "node:buffer";
import tar from 'tar-stream';
import gunzip from 'gunzip-maybe';
import {load as cheerio_load} from 'cheerio';
import hljs from 'highlight.js';

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
      var lang = el.attr('class').substring(9);
      var matcher = new RegExp(`([a-z]+::)?(install_github|pak|pkg_install)\\(.${universe}/${pkgname}.\\)`, "i");
      var input = el.text().replace(matcher, `# $&\ninstall.packages("${pkgname}", repos = c('https://${universe}.r-universe.dev', 'https://cloud.r-project.org'))`)
      var out = hljs.highlight(input, {language: lang}).value
      el.addClass("hljs").empty().append(out);
    } catch (e) {console.log(e) }
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
