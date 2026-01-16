import path from 'node:path';
import express from 'express';
import createError from 'http-errors';
import {list_package_files, get_package_stream} from '../src/db.js';
import {extract_files_from_stream, index_files_from_stream, cheerio_hljs, cheerio_page} from '../src/tools.js';

const router = express.Router();

function get_package_file(pkg, universe, filename){
  return get_package_stream(pkg, universe).then(function(stream){
    if(!stream)
      throw createError(404, "Failed to create filestream");
    return extract_files_from_stream(stream, [`${pkg}/${filename}`]);
  }).then(function([buf]){
    if(!buf)
      throw createError(404, `File ${filename} not found in package ${pkg}`);
    return buf;
  });
}

function send_package_file(req, res, filename, content_type){
  return get_package_file(req.params.package, req.universe, filename).then(function(buf){
    //buffers become application/octet-stream of no type is set
    res.type(content_type || normalize_filetype(filename)).send(buf);
  });
}

function get_package_index(pkg, universe){
  return get_package_stream(pkg, universe).then(function(stream){
    if(!stream)
      throw createError(404, "Failed to create filestream");
    return index_files_from_stream(stream);
  });
}

function normalize_doc_path(file, pkgname){
  switch(file.toLowerCase()) {
    case "readme.html":
      return `extra/readme.html`;
    case "readme.md":
      return `extra/readme.md`;
    case `manual.html`:
      return `extra/${pkgname}.html`;
    default:
      return `inst/doc/${file}`;
  }
}

function normalize_filetype(filename){
  return path.basename(filename).replace(/\.(r|rmd|rnw|cff|tex|md|rtex|rhtml)$/i, '.txt');
}

router.get('/:package/files', function(req, res, next) {
  return list_package_files(req.params.package, req.universe).then(x => res.send(x));
});

router.get('/:package/DESCRIPTION', function(req, res, next) {
  return send_package_file(req, res, 'DESCRIPTION', 'text/plain');
});

router.get('/:package/:file.pdf', function(req, res, next){
  if(req.params.package != req.params.file)
    throw createError(404, `File not found, did you mean ${req.params.package}.pdf?`)
  return send_package_file(req, res, 'manual.pdf');
});

router.get('/:package/NEWS{:ext}', function(req, res, next){
  var ext = req.params.ext || '.html';
  return send_package_file(req, res, `extra/NEWS${ext}`);
});

router.get('/:package/citation{:ext}', function(req, res, next){
  var ext = req.params.ext || '.html';
  return send_package_file(req, res, `extra/citation${ext}`);
});

router.get('/:package/doc', function(req, res, next){
  var pkgname = req.params.package;
  return get_package_index(pkgname, req.universe).then(function(index){
    var output = [];
    index.files.forEach(function(x){
      var m = x.filename.match(`^${pkgname}/inst/doc/(.+)$`);
      if(m) output.push(m[1]);
    });
    output.unshift('manual.html')
    return res.send(output);
  });
});

router.get('/:package/doc/readme', function(req, res, next){
  var pkgname = req.params.package;
  var universe = req.universe;
  return get_package_file(pkgname, req.universe, `extra/readme.html`).then(function(html){
    if(req.query.highlight === 'hljs'){
      html = cheerio_hljs(html, pkgname, universe);
    }
    res.type('text/html; charset=utf-8').send(html);
  });
});

router.get('/:package/doc/page/:page', function(req, res, next){
  var pkgname = req.params.package;
  var universe = req.universe;
  var page = req.params.page;
  return get_package_file(pkgname, req.universe, `extra/${pkgname}.html`).then(function(html){
    var pagehtml = cheerio_page(html, page, pkgname, universe);
    res.type('text/html; charset=utf-8').send(pagehtml);
  });
});

router.get('/:package/doc/:file', function(req, res, next){
  var filename = normalize_doc_path(req.params.file, req.params.package);
  return send_package_file(req, res, filename);
});

export default router;
