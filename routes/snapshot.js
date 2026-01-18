import express from 'express';
import zlib from 'node:zlib';
import archiver from 'archiver';
import path from 'node:path';
import {pkgfields, doc_to_dcf, doc_to_paths, extract_files_from_stream} from '../src/tools.js';
import {mongo_download_stream, packages} from '../src/db.js';

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
  return archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.log(err)
    } else {
      throw err;
    }
  }).on('error', function(err) {
    throw err;
  })
}

async function packages_snapshot(files, archive, types){
  var indexes = {};
  for (var x of files){
    if(types.includes(x._type)){
      for (var filename of doc_to_paths(x)){
        var dirname = path.dirname(filename);
        if(!indexes[dirname])
          indexes[dirname] = [];
        indexes[dirname].push(x);

        await mongo_download_stream(x._fileid).then(function(stream){
          return archive.append_stream(stream, { name: filename, date: x._created });
        }).catch(function(e){
          console.log(`Failed adding a file to snapshot: ${e}`);
        });
      }
    }
  };

  /* Generate PACKAGES indexes */
  for (const [path, files] of Object.entries(indexes)) {
    var packages = files.map(doc_to_dcf).join('');
    archive.append(packages, { name: `${path}/PACKAGES` });
    archive.append(zlib.gzipSync(packages), { name: `${path}/PACKAGES.gz`});
  }

  /* Extract html manual pages. This is a bit slower so doing this last */
  if(types.includes('docs')) {
    for (var x of files.filter(x => x._type == 'src')){
      var pkgname = x.Package;
      await mongo_download_stream(x._fileid).then(function(stream){
        return extract_files_from_stream(stream, `${pkgname}/extra/${pkgname}.html`).then(function([buf]){
          return archive.append(buf, { name: `docs/${pkgname}.html`, date: x._created });
        });
      }).catch(function(e){
        console.log(`Failed adding a docs file to snapshot: ${e}`);
      });
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
      throw "Query returned no packages";
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
    archive.pipe(res.set('Cache-Control', 'no-store'));
    return packages_snapshot(files, archive, types).then(function(){
      return archive.finalize();
    }).catch(function(err){
      archive.abort();
      res.end();
      console.log(`Failure streaming snapshot archive: ${err}`);
      // We already started sending the stream so can't error out anymore
      // throw err;
    });
  });
});

export default router;
