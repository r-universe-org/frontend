import express from 'express';
import gunzip from 'gunzip-maybe';
import {pipeline} from 'node:stream/promises';
import createError from 'http-errors';
import {get_bucket_stream, bucket_find} from '../src/db.js';
import {index_files_from_stream, cursor_stream} from '../src/tools.js';

const router = express.Router();

function send_from_bucket(hash, operation, res){
  return get_bucket_stream(hash).then(function(pkg){
    let name = pkg.filename;
    if(operation == 'send'){
      let type = name.endsWith('.zip') ? 'application/zip' : 'application/x-gzip';
      return pipeline(
        pkg.stream,
        res.type(type).attachment(name).set({
          'Content-Length': pkg.length,
          'Cache-Control': 'public, max-age=31557600, immutable',
          'Last-Modified' : pkg.uploadDate.toUTCString()
        })
      );
    }

    if(operation == 'index'){
      if(!name.endsWith('gz')){
        pkg.stream.destroy();
        throw createError(500, `Unable to index ${name} (only tar.gz files are supported)`);
      }
      return index_files_from_stream(pkg.stream).then(function(index){
        index.files.forEach(function(entry){
          entry.filename = entry.filename.match(/\/.*/)[0]; //strip pkg root dir
        });
        index.gzip = true;
        res.send(index);
      });
    }

    if(operation == 'decompress'){
      if(!name.endsWith('gz')){
        pkg.stream.destroy();
        throw createError(`Unable to decompress ${name} (only tar.gz files are suppored)`);
      }
      var tarname = name.replace(/(tar.gz|tgz)/, 'tar');
      return pipeline(
        pkg.stream,
        gunzip(),
        res.type('application/tar').attachment(tarname).set({
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Last-Modified' : pkg.uploadDate.toUTCString()
        })
      );
    }

    throw createError(400, `Unsuppored operation ${operation}`);
  });
}

/* Reduce noise from crawlers in log files */
router.get("/robots.txt", function(req, res, next) {
  res.type('text/plain').send(`User-agent: *\nDisallow: /\n`);
});

router.get("/:hash{/:postfix}", function(req, res, next) {
  let hash = req.params.hash || "";
  let postfix = req.params.postfix || "send";
  if(hash.length != 64) //should sha256
    return next(createError(400, "Invalid hash length"));
  return send_from_bucket(hash, postfix, res);
});

/* index all the files on the cdn */
router.get("/", function(req, res, next) {
  var cursor = bucket_find({}, {sort: {uploadDate: -1}, project: {_id: 1, filename: 1}});
  return cursor_stream(cursor, res.type('text/plain'), x => `${x._id} ${x.uploadDate.toISOString()} ${x.filename}\n`)
});

export default router;
