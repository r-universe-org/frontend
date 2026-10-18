import createError from 'http-errors';
import express from 'express';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import archiver from 'archiver';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pkgfields, doc_to_dcf, doc_to_paths, extract_files_from_stream, doc_as_strings, stream2buffer} from '../src/tools.js';
import {get_stream_by_url_or_key, packages} from '../src/db.js';
import {packagesRDSAsync} from "@r-universe/packages-rds";


const gzip = promisify(zlib.gzip);
const router = express.Router();

function new_zipfile(format){
  /* contents are already compressed */
  const archive = archiver(format, {
    store: true, gzip: true, gzipOptions: {level: 1},
  });
  archive.append_stream = function(source, data){
    return new Promise((resolve, reject) => {
      source.on('end', resolve);
      source.on('error', reject);
      //archive.on('entry', resolve);
      archive.append(source, data);
    });
  }
  return archive;
}

/* Files are small (median ~200kB) and each R2 request has ~50ms latency, so fetching
   them one by one is slow. Prefetch small files into memory a few at a time, while
   adding them to the archive in order. Large files are streamed directly instead. */
const prefetch_concurrency = 8;
const prefetch_max_size = 8 * 1024 * 1024;

// Runs fn(item) for up to 'concurrency' items ahead, yielding results in order.
async function* prefetch_map(items, fn, concurrency = prefetch_concurrency){
  const pending = [];
  let next = 0;
  const start = () => {
    const item = items[next++];
    const p = Promise.resolve().then(() => fn(item)).then(value => ({item, value}), error => ({item, error}));
    pending.push(p);
  };
  while(next < items.length && pending.length < concurrency) start();
  while(pending.length){
    const result = await pending.shift();
    if(next < items.length) start();
    yield result;
  }
}

function prefetch_file(x){
  if(!(x.Filesize > 0 && x.Filesize <= prefetch_max_size)){
    return null; //large or unknown size: stream when it is our turn
  }
  return get_stream_by_url_or_key(x._fileid).then(stream2buffer);
}

async function packages_snapshot(files, archive, types){
  
  var abort = false;
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.log(err)
    } else {
      abort = err;
    }
  }).on('error', function(err) {
    abort = err;
  });

  var indexes = {};
  var selected = files.filter(x => types.includes(x._type));
  for await (const {item: x, value: buf, error} of prefetch_map(selected, prefetch_file)){
    for (const filename of doc_to_paths(x)){
      if(abort){
        throw abort;
      }
      var dirname = path.dirname(filename);
      if(!indexes[dirname])
        indexes[dirname] = [];
      indexes[dirname].push(x);
      if(error){
        console.log(`Failed adding a file to snapshot: ${error}`);
        continue;
      }
      await (buf ? Promise.resolve(Readable.from([buf])) : get_stream_by_url_or_key(x._fileid)).then(function(stream){
        return archive.append_stream(stream, { name: filename, date: x._created }).finally(e => stream.destroy());
      }).catch(function(e){
        console.log(`Failed adding a file to snapshot: ${e}`);
      });
    }
  };

  /* Generate PACKAGES indexes */
  for (const [path, files] of Object.entries(indexes)) {
    var packages = files.map(x => doc_to_dcf(x)).join('');
    archive.append(packages, { name: `${path}/PACKAGES` });
    archive.append(await gzip(packages), { name: `${path}/PACKAGES.gz`});
    archive.append(await packagesRDSAsync(files.map(x => doc_as_strings(x)), { compress: 'gzip' }), { name: `${path}/PACKAGES.rds`});
  }

  /* Extract html manual pages. This is a bit slower so doing this last */
  if(types.includes('docs')) {
    if(abort){
      throw abort;
    }
    const extract_docs = (x) => get_stream_by_url_or_key(x._fileid).then(function(stream){
      return extract_files_from_stream(stream, [`${x.Package}/extra/${x.Package}.html`]).finally(() => stream.destroy());
    });
    for await (const {item: x, value, error} of prefetch_map(files.filter(x => x._type == 'src'), extract_docs)){
      if(abort){
        throw abort;
      }
      if(error || !value[0]){
        console.log(`Failed adding a docs file to snapshot: ${error || 'no html manual found'}`);
        continue;
      }
      archive.append(value[0], { name: `docs/${x.Package}.html`, date: x._created });
    };
  }
}

router.get('/api/snapshot{/:format}', function(req, res, next) {
  var user = res.locals.universe;
  var query = {_user: user, _registered: true, _type: {'$ne' : 'failure'}};
  var types = req.query.types ? req.query.types.split(',') : ['src', 'win', 'mac', 'linux', 'wasm', 'docs'];
  if(req.query.packages)
    query.Package = {'$in' : req.query.packages.split(",")};
  if(req.query.skip_packages){
    query.Package = {'$nin' : req.query.skip_packages.split(",")};
  }
  var cursor = packages.find(query).project(pkgfields).sort({"_type" : 1});
  return cursor.toArray().then(function(files){
    if(!files.length)
      throw createError(404, "Query returned no packages");
    if(req.query.binaries){
      var allowed = req.query.binaries.split(",");
      files = files.filter(function(doc){
        var binver = doc.Built && doc.Built.R || "";
        return doc._type == 'src' || allowed.find(ver => binver.startsWith(ver));
      });
    }
    var format = req.params.format || "zip";
    if(format == 'zip'){
      res.type('application/zip').attachment(`${user}-snapshot.zip`)
    } else if(format == 'tar') {
      res.type('application/gzip').attachment(`${user}-snapshot.tar.gz`)
    } else {
      throw "Unsupported snapshot format: " + format;
    }
    var archive = new_zipfile(format);
    var p1 = pipeline(archive, res.set('Cache-Control', 'no-store'));
    var p2 = packages_snapshot(files, archive, types).then(function(){
      return archive.finalize();
    });
    return Promise.all([p1, p2]).catch(function(err){
      archive.abort();
      archive.destroy();
      res.end();
      // We already started sending the stream so can't error out anymore
      console.log(`Failure streaming snapshot archive: ${err}`);
    });
  });
});

export default router;
