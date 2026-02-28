import {MongoClient, GridFSBucket} from 'mongodb';
import {Readable, pipeline} from  "node:stream";
import path from 'node:path';
import crypto from 'node:crypto';
import {pkgfields, doc_to_paths, extract_files_from_stream} from './tools.js';
import createError from 'http-errors';

const HOST = process.env.CRANLIKE_MONGODB_SERVER || '127.0.0.1';
const PORT = process.env.CRANLIKE_MONGODB_PORT || 27017;
const USER = process.env.CRANLIKE_MONGODB_USERNAME || 'root';
const PASS = process.env.CRANLIKE_MONGODB_PASSWORD;
const AUTH = PASS ? (USER + ':' + PASS + "@") : "";
const URL = 'mongodb://' + AUTH + HOST + ':' + PORT;
const production = process.env.NODE_ENV == 'production';

/* Connect to database */
console.log("Connecting to database....")
const client = await MongoClient.connect(URL);
const db = client.db('cranlike');
const bucket = new GridFSBucket(db, {bucketName: 'files'});
export const packages = db.collection('packages');
const chunks = db.collection('files.chunks');
const universes = packages.distinct('_universes');
console.log("Connected to MongoDB!");

//removes and recreates all indexes
if(process.env.REBUILD_INDEXES){
  console.log("REBUILDING INDEXES!")
  mongo_rebuild_indexes();
}

function mongo_latest(q){
  if(!packages || !packages.find)
    throw new Error("No mongodb connection available.");
  return packages.findOne(q, {sort:{_published: -1}, project: {_id: 1, _published: 1, _user: 1, Package: 1}});
}

function mongo_find(q){
  if(!packages || !packages.find)
    throw new Error("No mongodb connection available.");
  return packages.find(q);
}

function mongo_aggregate(q){
  if(!packages || !packages.aggregate)
    throw new Error("No mongodb connection available.");
  return packages.aggregate(q);
}

function mongo_ls_packages(universe){
  if(!packages || !packages.aggregate)
    throw new Error("No mongodb connection available.");
  // include remotes here because we use it to identify missing builds
  let query = {_type: {$in: ['src', 'failure']}};
  if(universe != '_global')
    query._user = universe;
  return packages.distinct('Package', query);
}

function mongo_distinct(key, query){
  if(!packages || !packages.aggregate)
    throw new Error("No mongodb connection available.");
  return packages.distinct(key, query);
}

// after deleting a package
function mongo_cache_invalidate(universe){
  return mongo_latest({_universes: universe}).then(function(doc){
    if(doc){
      console.log(`Invalidating cache for ${doc._user} via ${doc.Package}`)
      const now = new Date();
      return packages.updateOne(
        { _id: doc['_id'] },
        { "$set": {"_published": now}}
      );
    }
  });
}

function group_package_data(docs){
  var src = docs.find(x => x['_type'] == 'src');
  var failure = docs.find(x => x['_type'] == 'failure');
  if(!src){
    //no src found, package probably only has a 'failure' submission
    if(failure) {
      src = Object.assign({}, failure); //shallow copy to delete src.Version
      delete src.Version;
    } else {
      return null;
    }
  }
  if(failure){
    var job = failure._jobs && failure._jobs.find(x => x.config == 'source') || null;
    src._failure = {
      version: failure.Version,
      commit: failure._commit,
      buildurl: failure._buildurl,
      date: failure._created,
      job: job,
    }
  }
  src._binaries = docs.filter(x => x.Built).map(function(x){
    return {
      r: x.Built.R,
      os: x['_type'],
      version: x.Version,
      date: x._created,
      distro: x['_type'] == 'linux' && x._distro || undefined,
      arch: x.Built.Platform && x.Built.Platform.split("-")[0] || undefined,
      commit: x._commit.id,
      fileid: x['_fileid'],
      status: x['_status'],
      check: x['_check'],
      buildurl: x['_buildurl']
    }
  });
  return src;
}

function days_ago(n){
  var now = new Date();
  return now.getTime()/1000 - (n*60*60*24);
}

function array_size(key){
  return {$cond: [{ $isArray: key }, {$size: key}, 0 ]};
}

function array_first(key){
  return {$cond: [{ $isArray: key }, {$first: key}, null ]};
}

function summary_count(k, q) {
  return packages.aggregate([
    {$match:q},
    {$unwind: `$${k.split('.')[0]}`},
    {$count: "total"}
  ]);
}

function summary_unique(k, q) {
  return packages.aggregate([
    {$match:q},
    {$unwind: `$${k.split('.')[0]}`},
    {$group: {_id: { $toHashedIndexKey: `$${k}`}}},
    {$count: "total"}
  ]);
}

function summary_sum(k, q) {
  return packages.aggregate([
    {$match:q},
    {$group: {_id: 1, total: {$sum: `$${k}`}}},
  ]);
}

function build_projection(fields){
  if(!fields || !fields.length) return {_id:0};
  var projection = {Package:1, _type:1, _user:1, _indexed: 1, _id:0};
  fields.forEach(function (f) {
    if(f == '_binaries'){
      projection['Built'] = 1;
      projection['_status'] = 1;
      projection['_check'] = 1;
      if(!fields.includes("_commit"))
        projection['_commit.id'] = 1;
    } else {
      projection[f] = 1;
    }
  });
  return projection;
}

export function mongo_all_files(universe, type, before, fields){
  var query = {};
  if(universe){
    query['_user'] = universe;
  }
  if(type){
    query['_type'] = type;
  }
  if(before){
    query['_created'] = {'$lt': new Date(before)};
  }
  var projection = {
    _id: 0,
    type: '$_type',
    user: '$_user',
    package: '$Package',
    version: '$Version',
    r: '$Built.R',
    published: { $dateToString: { format: "%Y-%m-%d", date: "$_created" } }
  }
  if(fields){
    fields.split(",").forEach(function (f) {
      projection[f] = 1;
    });
  }
  return packages.find(query).project(projection);
}

function mongo_package_files(pkg, universe){
  return mongo_find({_user: universe, Package: pkg, _registered: true}).toArray();
}

function mongo_package_info(pkg, universe){
  return mongo_find({_user: universe, Package: pkg, _registered: true}).toArray().then(function(docs){
    if(!docs.length) //should never happen because we checked earlier
      throw createError(404, `Package ${pkg} not found in ${universe}`);
    var pkgdata = group_package_data(docs);
    if(pkgdata._type === 'failure')
      throw createError(404, `Package ${pkg} failed to build: ${pkgdata._buildurl}`)
    return pkgdata;
  });
}

function mongo_package_hash(query){
  var options = {project: {_fileid: 1, Version: 1}};
  if(query['$or']){
    options.sort = {_type: 1}; //prefer linux binary over src packages
  }
  return packages.findOne(query, options).then(function(x){
    if(!x)
      throw createError(404, 'Package not found for query: ' + JSON.stringify(query));
    return x;
  });
}

export function mongo_search(query, limit = 100, skip = 0){
  var project = {
    Package: 1,
    Title: 1,
    Description:1,
    _user:1,
    _score: 1,
    _usedby: 1,
    _searchresults: 1,
    _uuid: '$_userbio.uuid',
    maintainer: '$_maintainer',
    updated: '$_commit.time',
    stars: '$_stars',
    topics: '$_topics'
  };
  if(query['$text']){
    project.match = {$meta: "textScore"};
    project.rank = {$multiply:[{ $min: [{$meta: "textScore"}, 150]}, '$_score']};
  } else {
    project.rank = '$_score';
  }
  var cursor = packages.aggregate([
    { $match: query},
    { $project: project},
    { $sort: {rank: -1}},
    { $facet: {
        results: [{ $skip: skip }, { $limit: limit }],
        stat: [{$count: 'total'}]
      }
    }
  ]);
  return cursor.next().then(function(out){
    out.query = query;
    out.skip = skip;
    out.limit = limit;
    if(out.stat && out.stat.length){
      out.total = out.stat[0].total;
    }
    //remove fields unrelated to the search
    delete out.query._type;
    delete out.query._registered;
    delete out.query._indexed;
    delete out.stat;
    return out;
  });
}

//TODO: because _universe is only set for source package,
//Using all:true implies no binaries are included.
export function mongo_universe_packages(user, fields, limit = 5000, all = true, skip_remotes = true){
  var query = all ? {'_universes': user} : {'_user': user};
  var projection = build_projection(fields);
  var postmatch = {'$or': [{indexed: true}, {'_id.user': user}]};
  if(user == 'cran'){
    postmatch = {indexed: true}; //only list indexed cran packages
  }
  if(skip_remotes){
    query._registered = true;
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$project: projection},
    {$group : {
      _id : {'Package': '$Package', 'user':'$_user'},
      indexed: { $addToSet: "$_indexed" },
      timestamp: { $max : "$_commit.time" },
      files: { '$push': '$$ROOT' }
    }},
    {$match: postmatch},
    {$sort : {timestamp : -1}},
    {$limit : limit}
  ]);
  return cursor.toArray().then(function(pkglist){
    if(!pkglist.length)
      throw createError(404, `No packages found in this universe: ${user}`)
    return pkglist.map(x => group_package_data(x.files));
  });
}

function mongo_universe_vignettes(user){
  var query = {_universes: user, _type: 'src', '_vignettes' : {$exists: true}};
  if(user == 'cran'){
    query['_indexed'] = true;
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$sort : {'_commit.time' : -1}},
    {$project: {
      _id: 0,
      user: '$_user',
      package: '$Package',
      version: '$Version',
      maintainer: '$Maintainer',
      universe: '$_user',
      pkglogo: '$_pkglogo',
      upstream: '$_upstream',
      login: '$_maintainer.login',
      published: '$_commit.time',
      vignette: '$_vignettes'
    }},
    {$unwind: '$vignette'}
  ]);
  return cursor.toArray();
}

function mongo_universe_binaries(user, type){
  var query = {_user: user};
  if(type){
    query._type = type;
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$group:{_id: {type: "$_type", R: "$Built.R", Platform: "$Built.Platform"}, count: { $sum: 1 }}}
  ]).project({_id: 0, count: 1, type: "$_id.type", R: "$_id.R", Platform: "$_id.Platform"});
  return cursor.toArray();
}

export function mongo_universe_updates(universe){
  var query = {_type: 'src', '_registered' : true};
  if(universe){
    query._universes = universe;
  }
  var cursor = packages.aggregate([
    {$match: query},
    {$project: {
      _id: 0,
      package: '$Package',
      updates: '$_updates'
    }},
    {$unwind: "$updates"},
    {$group: {_id: "$updates.week", total: {$sum: '$updates.n'}, packages: {$addToSet: {k:'$package', v:'$updates.n'}}}},
    {$project: {_id:0, week: '$_id', total: '$total', packages: {$arrayToObject:{$sortArray: { input: "$packages", sortBy: { v: -1 } }}}}},
    {$sort:{ week: 1}}
  ]);
  return cursor;
}

function mongo_universe_s3_index(user, prefix, start_after){
  var query = {_user: user, _registered: true, _type: {'$ne': 'failure'}};
  var proj = {MD5sum:1, Package:1, Version:1, Built:1, _distro:1, _type:1, _id:1,  _published:1, _filesize:1};
  return mongo_find(query).sort({_id: 1}).project(proj).toArray().then(function(docs){
    if(!docs.length) //should not happen because we checked earlier
      throw createError(404, `No packages found in ${user}`);
    var files = [];
    var indexes = {};
    docs.forEach(function(doc){
      doc_to_paths(doc).forEach(function(fpath){
        if(!prefix || fpath.startsWith(prefix)) {
          files.push({
            Key: fpath,
            ETag: doc.MD5sum,
            LastModified: doc._published.toISOString(),
            Size: doc._filesize
          });
          var repodir = path.dirname(fpath);
          if(!(indexes[repodir] > doc._published)){
            indexes[repodir] = doc._published;
          }
        }
      });
    });

    for (const [path, date] of Object.entries(indexes)) {
      files.push({ Key: path + '/PACKAGES', LastModified: date.toISOString()});
      files.push({ Key: path + '/PACKAGES.gz', LastModified: date.toISOString()});
    }

    if(start_after){
      var index = files.findIndex(x => x.Key == start_after);
      if(index > -1){
        files = files.slice(index + 1);
      }
    }
    return files;
  });
}

/* NB Contributions are grouped by upstream url instead of package namme to avoid duplicate counting
 * of contributions in repos with many packages, e.g. https://github.com/r-forge/ctm/tree/master/pkg */
function mongo_universe_contributors(user, limit = 20){
  var query = {_type: 'src', '_registered' : true};
  if(user){
    query._universes = user;
  } else {
    query._indexed = true;
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$project: {
      _id: 0,
      contributors: '$_contributors',
      upstream: '$_upstream'
    }},
    {$unwind: "$contributors"},
    {$group: {_id: "$contributors.user", repos: {$addToSet: {upstream: '$upstream', count: '$contributors.count'}}}},
    {$project: {_id:0, login: '$_id', total: {$sum: '$repos.count'}, repos: 1}},
    {$sort:{ total: -1}},
    {$limit: limit}
  ]);
  return cursor.toArray();
}

function mongo_universe_contributions(user, limit = 20){
  var query = {_type: 'src', '_contributors.user': user, '_indexed' : true, '_maintainer.login': {$ne: user}};
  var cursor = mongo_aggregate([
    {$match: query},
    {$addFields: {contrib: {$arrayElemAt:['$_contributors', { $indexOfArray: [ "$_contributors.user", user ]}]}}},
    {$group: {
      _id: "$_upstream",
      owner: {$first: '$_user'}, //equals upstream org
      packages: {$addToSet: '$Package'},
      maintainers: {$addToSet: '$_maintainer.login'}, //upstreams can have multiple pkgs and maintainers
      contributions: {$max: '$contrib.count'}
    }},
    {$project: {_id:0, contributions:'$contributions', upstream: '$_id', owner: '$owner', packages: '$packages', maintainers: '$maintainers'}},
    {$sort:{ contributions: -1}},
    {$limit: limit}
  ]);
  return cursor.toArray();
}

export function mongo_universe_maintainers(user, limit = 100){
  var query = {_universes: user, _type: 'src', _registered : true};
   //We assume $natural sort such that the last matches have most recent email-login mapping.
  var cursor = packages.aggregate([
    {$match: query},
    {$group: {
      _id : '$_maintainer.email',
      updated: { $max: '$_commit.time'},
      name : { $first: '$_maintainer.name'},
      uuid : { $addToSet: '$_maintainer.uuid'}, //can be null
      login : { $addToSet: '$_maintainer.login'}, //can be null
      orcid : { $addToSet: '$_maintainer.orcid'}, //can be null
      mastodon : { $addToSet: '$_maintainer.mastodon'}, //can be null
      bluesky : { $addToSet: '$_maintainer.bluesky'}, //can be null
      linkedin : { $addToSet: '$_maintainer.linkedin'}, //can be null
      orgs: { $push:  { "k": "$_user", "v": true}},
      scores : { $sum: '$_score' },
      count : { $sum: 1 },
    }},
    {$set: {orgs: {$arrayToObject: '$orgs'}, orcid: {$last: '$orcid'}, mastodon: {$last: '$mastodon'}, bluesky: {$last: '$bluesky'}, linkedin: {$last: '$linkedin'}, uuid: {$last: '$uuid'}, login: {$last: '$login'}}},
    {$group: {
      _id : { $ifNull: [ "$login", "$_id" ]},
      uuid: { $last: '$uuid'},
      login: { $last: '$login'},
      emails: { $addToSet: '$_id' },
      updated: { $max: '$updated'},
      name : { $last: '$name'},
      orcid : { $addToSet: "$orcid"},
      bluesky : { $addToSet: "$bluesky"},
      linkedin : { $addToSet: "$linkedin"},
      mastodon : { $addToSet: "$mastodon"},
      scores : { $sum: '$scores' },
      count : { $sum: '$count'},
      orgs: {$mergeObjects: '$orgs'}
    }},
    {$project: {
      _id: 0,
      login: 1,
      uuid: 1,
      emails: 1,
      updated: 1,
      name: 1,
      count : 1,
      scores: 1,
      orcid: {$last: '$orcid'},
      bluesky: {$last: '$bluesky'},
      linkedin: {$last: '$linkedin'},
      mastodon: {$last: '$mastodon'},
      orgs: {$objectToArray: "$orgs"}
    }},
    {$set: {orgs: '$orgs.k'}},
    {$sort:{ scores: -1}},
    {$limit: limit}
  ]);
  return cursor;
}

export function mongo_summary(universe){
  var query = {_type: 'src', _registered: true};
  var query_all = {}
  if(universe){
    query._universes = universe;
    query_all._user = universe;
  }
  var p1 = summary_unique('Package', query);
  var p2 = summary_unique('_maintainer.email', query);
  var p3 = summary_count('_vignettes.source', query);
  var p4 = summary_count('_datasets.name', query);
  var p5 = summary_unique('_user', {'_userbio.type': 'organization', ...query});
  var p6 = summary_unique('_contributors.user', query);
  var p7 = summary_sum('_filesize', query_all);
  var promises = [p1, p2, p3, p4, p5, p6, p7].map(function(p){
    return p.next().then(res => res ? res.total : 0);
  })
  return Promise.all(promises).then(function([packages, maintainers, articles, datasets, orgs, contributors, filesize]){
    return {
      packages: packages,
      maintainers: maintainers,
      articles: articles,
      datasets: datasets,
      organizations: orgs,
      filesize: filesize,
      contributors: contributors
    };
  });
}

export function mongo_usedbyorg(pkgname, universe){
  var query = {_type: 'src', '_dependencies.package': pkgname, '_indexed': true};
  if(universe){
    query._universes = universe;
  }
  var cursor = packages.aggregate([
    {$match : query},
    {$group : {
      _id: "$_user",
      packages : { $addToSet: { package: "$Package", maintainer :'$_maintainer.login', stars: '$_stars'}},
      allstars: { $sum: '$_stars'},
    }},
    {$project:{_id: 0, owner: "$_id", packages: 1, allstars:1}},
    {$sort : {allstars : -1}},
  ]);
  return cursor;
}

export function mongo_all_universes(organizations_only, limit = 999999){
  var query = {_type: 'src', _registered: true};
  if(organizations_only){
    query['_userbio.type'] = 'organization';
    query['_user'] = {$ne: 'cran'};
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$sort:{ _id: -1}},
    {$group: {
      _id : '$_user',
      updated: { $max: '$_commit.time'},
      packages: { $sum: 1 },
      indexed: { $sum: { $toInt: '$_indexed' }},
      name: { $first: '$_userbio.name'},
      type: { $first: '$_userbio.type'},
      uuid: { $first: '$_userbio.uuid'},
      bio: { $first: '$_userbio.description'},
      emails: { $addToSet: '$_maintainer.email'}
    }},
    {$project: {_id: 0, universe: '$_id', packages: 1, updated: 1, type: 1, uuid: 1,
      indexed:1, name: 1, bio: 1, maintainers: { $size: '$emails' },
    }},
    {$sort:{ indexed: -1}},
    {$limit : limit}
  ]);
  return cursor;
}

function mongo_all_scores(){
  var query = {_type: 'src', _indexed: true};
  var projection = {
    _id: 0,
    package: '$Package',
    universe: "$_user",
    score: '$_score',
    stars: "$_stars",
    downloads: "$_downloads.count",
    scripts: "$_searchresults",
    dependents: '$_usedby',
    commits: {$sum: '$_updates.n'},
    contributors: array_size('$_contributors'),
    datasets: array_size('$_datasets'),
    vignettes: array_size('$_vignettes'),
    releases: array_size('$_releases')
  }
  var cursor = mongo_find(query).sort({_score: -1}).project(projection);
  return cursor.toArray();
}

export function mongo_all_sysdeps(universe, distro){
  var query = {_type: 'src', '_sysdeps': {$exists: true}};
  if(universe){
    query['_universes'] = universe;
  }
  if(distro){
    query['_distro'] = distro;
  }
  var cursor = mongo_aggregate([
    {$match: query},
    {$unwind: '$_sysdeps'},
    {$group: {
      _id : '$_sysdeps.name',
      packages: { $addToSet: '$_sysdeps.package'},
      headers: { $addToSet: '$_sysdeps.headers'},
      version: { $first: '$_sysdeps.version'},
      homepage: { $addToSet: '$_sysdeps.homepage'},
      description: { $addToSet: '$_sysdeps.description'},
      distro : { $addToSet: '$_distro'},
      usedby : { $addToSet: {owner: '$_owner', package:'$Package'}}
    }},
    {$project: {_id: 0, library: '$_id', packages: 1, headers: 1, version: 1, usedby: 1,
      homepage: { '$first' : '$homepage'}, description: { '$first' : '$description'}, distro:{ '$first' : '$distro'}}},
    {$sort:{ library: 1}}
  ]);
  return cursor;
}

function mongo_all_articles(){
  var cursor = mongo_aggregate([
    {$match: {_type: 'src', _indexed: true, '_vignettes' : {$exists: true}}},
    {$project: {
      _id: 0,
      universe: '$_user',
      package: '$Package',
      maintainer: '$_maintainer.name',
      vignette: '$_vignettes'
    }},
    {$unwind: '$vignette'},
    {$project: {
      _id: 0,
      universe: 1,
      package: 1,
      title: '$vignette.title',
      filename: '$vignette.filename',
      author: { $ifNull: [ '$vignette.author', '$maintainer' ]},
      updated: '$vignette.modified'
    }},
    {$sort:{ updated: -1}},
  ]);
  return cursor.toArray();
}

function mongo_all_datasets(){
  var cursor = mongo_aggregate([
    {$match: {_type: 'src', _indexed: true, '_datasets' : {$exists: true}}},
    {$sort:{ _id: -1}},
    {$project: {
      _id: 0,
      universe: '$_user',
      package: '$Package',
      dataset: '$_datasets'
    }},
    {$unwind: '$dataset'},
    {$project: {
      _id: 0,
      universe: 1,
      package: 1,
      name: '$dataset.name',
      title: '$dataset.title',
      rows: '$dataset.rows',
      class: array_first('$dataset.class'),
      fields: array_size('$dataset.fields')
    }}
  ]);
  return cursor.toArray();
}

export function mongo_universe_topics(universe, min = 1, limit = 100){
  var query = {_type: 'src'};
  if(universe){
    query._universes = universe;
  }
  var cursor = packages.aggregate([
    {$match: query},
    {$unwind: '$_topics'},
    {$group: {
      _id : '$_topics',
      packages: { $addToSet: '$Package' }
    }},
    {$project: {_id: 0, topic: '$_id', packages: '$packages', count: { $size: "$packages" }}},
    {$match:{count: {$gte: min}}},
    {$sort:{count: -1}},
    {$limit: limit}
  ]);
  return cursor;
}

function mongo_recent_builds(days = 7){
  var query = {'_commit.time' : {'$gt': days_ago(days)}};
  var cursor = mongo_aggregate([
    {$match: query},
    {$group : {
      _id : { user: '$_user', package: '$Package', commit: '$_commit.id'},
      version: { $first : "$Version" },
      maintainer: { $first : "$_maintainer.name" },
      maintainerlogin: { $first : "$_maintainer.login" },
      timestamp: { $first : "$_commit.time" },
      upstream: { $first : "$_upstream" },
      registered: { $first: "$_registered" },
      os_restriction: { $addToSet: '$OS_type'},
      macbinary: { $addToSet : '$_macbinary' },
      winbinary: { $addToSet : '$_winbinary' },
      runs : { $addToSet:
        { type: "$_type", built: '$Built', date:'$_published', url: '$_buildurl', status: '$_status', distro: '$_distro', check: '$_check'}
      }
    }},
    {$sort : {"timestamp" : -1}},
    {$project: {
      _id: 0,
      user: '$_id.user',
      package: '$_id.package',
      commit: '$_id.commit',
      maintainer: 1,
      maintainerlogin: 1,
      version: 1,
      timestamp: 1,
      registered: 1,
      runs: 1,
      upstream: 1,
      macbinary: { $first: "$macbinary" },
      winbinary: { $first: "$winbinary" },
      os_restriction:{ $first: "$os_restriction" }
    }}
  ]);
  return cursor.toArray();
}

export function get_bucket_stream(hash){
  return bucket.find({_id: hash}, {limit:1}).next().then(function(pkg){
    if(!pkg)
      throw createError(410, `File ${hash} not available (anymore)`);
    // This error happens async and cannot get caught.
    // Errors needs to be thrown by the stream consumer instead of here.
    //stream.on('error', function(err){
    //  throw `Mongo stream error for ${key} (${err})`;
    //});
    pkg.stream = bucket.openDownloadStream(hash);
    return pkg;
  });
}

function get_download_stream(url){
  return fetch(url, { signal: AbortSignal.timeout(30000) }).then((res) => {
    if (res.ok) {
      return Readable.fromWeb(res.body);
    }
    throw new Error(`HTTP ${res.status} for: ${url}`);
  });
}

export function mongo_download_stream(key, force_cdn = false){
  if(production && !force_cdn){
    return get_bucket_stream(key).then(x => x.stream);
  } else {
    console.warn(`Fetching from https://cdn.r-universe.dev/${key}`);
    return get_download_stream(`https://cdn.r-universe.dev/${key}`);
  }
}

function mongo_package_stream(pkg, universe){
  var query = {Package: pkg, _user: universe, _type: 'src'};
  return packages.findOne(query, {sort: {'_id': -1}}).then(function(x){
    if(!x)
      throw createError(404, `Package ${pkg} not found in ${universe}`);
    return mongo_download_stream(x._fileid);
  });
}

export function mongo_indexes(){
  return packages.indexes();
}

export function mongo_dump(query){
  return packages.find(query, {raw: true});
}

export function get_package_info(pkg, universe){
  return mongo_package_info(pkg, universe);
}

export function list_package_files(pkg, universe){
  return mongo_package_files(pkg, universe);
}

export function get_package_stream(pkg, universe){
  return mongo_package_stream(pkg, universe);
}

export function get_package_file(pkg, universe, filename){
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

export function get_universe_vignettes(universe){
  return mongo_universe_vignettes(universe)
}

export function get_universe_binaries(universe, type){
  return mongo_universe_binaries(universe, type);
}

export function get_universe_contributors(universe, limit){
  return mongo_universe_contributors(universe, limit);
}

export function get_universe_contributions(universe, limit){
  return mongo_universe_contributions(universe, limit);
}

export function get_universe_s3_index(universe, prefix, start_after){
  return mongo_universe_s3_index(universe, prefix, start_after);
}

export function get_repositories(){
  return mongo_all_universes().toArray();
}

export function get_scores(){
  return mongo_all_scores()
}

export function get_organizations(){
  return mongo_all_universes(true).toArray();
}

export function get_sysdeps(){
  return mongo_all_sysdeps().toArray();
}

export function get_builds(){
  return mongo_recent_builds();
}

export function get_articles(){
  return mongo_all_articles();
}

export function get_datasets(){
  return mongo_all_datasets()
}

export function get_latest(query){
  return mongo_latest(query);
}

export function get_packages_index(query, fields = [], mixed = false){
  let projection = {...pkgfields};
  fields.forEach(function (f) {
    //console.log("adding", f)
    projection[f] = 1;
  });
  if(mixed){
    //NB: pre-sorting by _type makes sure we prefer binaries for sources.
    //Sorting final results (after the group) is very slow, we don't do this for now.
    return mongo_aggregate([
      {$match: query},
      {$sort: {_type:1}},
      {$project: projection},
      {$group : {
        _id : '$Package',
        _sysdeps: { '$last' : '$_sysdeps'}, //src package should match $last here
        doc: { '$first': '$$ROOT' }
      }},
      {$replaceRoot: { newRoot: {$mergeObjects: ['$doc', { _sysdeps: '$_sysdeps'}]}}}
    ]);
  } else {
    return mongo_find(query).project(projection).sort({"Package" : 1});
  }
}

export function find_cran_package(pkgname){
  pkgname = pkgname.toLowerCase();
  return packages.findOne({_nocasepkg : pkgname, _type : 'src', _user : 'cran'}).then(function(x){
    if(x) return x;
    return packages.findOne({_nocasepkg : pkgname, _type : 'src', _indexed : true}).then(function(y){
      if(y && y._realowner == y['_user']) return y;
      return packages.findOne({_nocasepkg : pkgname, _type : 'failure', _user : 'cran'}).then(function(failure){
        if(failure){
          throw createError(404, `CRAN package ${failure.Package} failed to build on r-universe: ${failure._buildurl}`);
        } else {
          throw createError(404, `Package ${pkgname} not found on CRAN.`);
        }
      });
    });
  });
}

export async function mongo_rebuild_indexes(){
  //print (or drop) indexes
  var indexes = await packages.indexes();
  for (let x of indexes) {
    if (x.name == '_id_') continue;
    console.log("Dropping index: " + x.name);
    await packages.dropIndex(x.name).catch(console.log);
  };

  function make_index(query){
    return packages.createIndex(query).then(() => console.log(`Created index: ${JSON.stringify(query)}`));
  }

  /* Speed up common query fields */
  /* NB: Dont use indexes with low cardinality (few unique values) */
  await make_index("Package");
  await make_index("_fileid");
  await make_index("_user");
  await make_index("_type");
  await make_index("_published");
  await make_index("_nocasepkg");
  await make_index("_commit.time");
  await make_index("_universes");
  await make_index("_topics");
  await make_index("_exports");
  await make_index("_score");
  await make_index({"_universes":1, "_commit.time":1});
  await make_index({"_universes":1, "Package":1});
  await make_index({"_user":1, "Package":1, "Version":1});
  await make_index({"_user":1, "_type":1, "Package":1});
  await make_index({"_user":1, "_type":1, "Package":1, "_arch": 1, "_major": 1});
  await make_index({"_user":1, "_type":1, "_distro":1, "_arch": 1, "_major": 1});
  await make_index({"_user":1, "_type":1, "_portable":1, "_arch": 1, "_major": 1});
  await make_index({"_user":1, "_commit.id":1, "Package":1});
  await make_index({"_user":1, "_type":1, "_commit.time":1});
  await make_index({"_user":1, "_type":1, "_registered":1, "_commit.time":1});
  await make_index({"_type":1, "_rundeps":1});
  await make_index({"_type":1, "_dependencies.package":1});
  await make_index({"_type":1, "_contributors.user":1});

  /* The text search index (only one is allowed) */
  //await packages.dropIndex("textsearch").catch(console.log);
  await packages.createIndex({
    _type:1,
    Package: "text",
    _owner: "text",
    Title: "text",
    Author: "text",
    Description: "text",
    '_vignettes.title': "text",
    '_vignettes.headings': "text",
    '_maintainer.name': "text",
    '_topics': "text",
    '_sysdeps.name': "text",
    '_exports' : "text",
    '_help.title' : "text",
    '_datasets.title' : "text"
  },{
    weights: {
      Package: 100,
      _owner: 20,
      Title: 5,
      Author: 3,
      Description: 1,
      '_vignettes.title': 5,
      '_vignettes.headings': 2,
      '_maintainer.name': 10,
      '_topics': 10,
      '_sysdeps.name': 20,
      '_exports' : 3,
      '_help.title' : 3,
      '_datasets.title' : 3
    },
    name: "textsearch"
  }).then(() => console.log(`Created index: text-search`));
  var new_indexes = await packages.indexes();
  console.log(new_indexes.map(x => x.name));
  console.log("rebuild_indexes complete!")
}

export function get_package_hash(query){
  return mongo_package_hash(query);
}

export function get_distinct(key, query){
  return mongo_distinct(key, query);
}

export function ls_packages(universe){
  return mongo_ls_packages(universe);
}

export function bucket_find(query, options = {}){
  return bucket.find(query, options);
}

export function mongo_everyone(query){
  var p1 = packages.distinct('_user', query);
  var p2 = packages.distinct('_maintainer.login', query);
  return Promise.all([p1, p2]).then((values) => {
    const out = {
      universes: values[0].sort(),
      maintainers: values[1].sort()
    };
    return out;
  });
}

export function get_all_universes(){
  return universes; //instant cached result
}

/*** Write APIs below **/

export function delete_file(key){
  return packages.findOne({_fileid : key}).then(function(doc){
    if(doc){
      console.log("Found other references, not deleting file: " + key);
    } else {
      return bucket.delete(key).then(function(){
        console.log("Deleted file " + key);
      });
    }
  });
}

export function delete_doc(doc, keep_file_id){
  if(doc._type === 'failure'){
    return packages.deleteOne({_id: doc['_id']}); // no file to delete
  }
  if(!doc._fileid) {
    throw "Calling delete_doc without doc._fileid";
  }
  return packages.deleteOne({_id: doc['_id']}).then(function(){
    if(doc._fileid !== keep_file_id){
      return delete_file(doc._fileid).then(()=>doc);
    }
  });
}

export function delete_by_query(query){
  return packages.find(query).project({_type: 1, _id:1, _fileid:1, Package:1, Version:1}).toArray().then(function(docs){
    return Promise.all(docs.map(delete_doc)).then(function(results){
      return mongo_cache_invalidate(query._user).then(() => results);
    });
  });
}

export function store_stream_file(stream, key, filename, metadata){
  return new Promise(function(resolve, reject) {
    var upload = bucket.openUploadStreamWithId(key, filename, {metadata: metadata});
    var hash = crypto.createHash('sha256');
    stream.on('data', data => hash.update(data));
    function cleanup_and_reject(err){
      /* Reject and clear possible orphaned chunks */
      console.log(`Error uploading ${key} (${err}). Deleting chunks.`);
      bucket.delete(key).finally(function(){
        console.log(`Chunks deleted for ${key}.`);
        reject("Error in openUploadStreamWithId(): " + err);
        chunks.deleteMany({files_id: key}).catch(console.log);
      });
    }
    pipeline(stream, upload, function(err){
      if(err){
        cleanup_and_reject(err);
      } else {
        db.command({filemd5: key, root: "files"}).catch(function(err){
          console.log(err); //if mongodb command fails (should never happen)
          return {};
        }).then(function(check){
          var shasum = hash.digest('hex');
          if(key == shasum && check.md5) {
            /* These days the sha256 is also the key so maybe we can simplify this */
            resolve({_id: key, length: upload.length, md5: check.md5, sha256: shasum});
          } else {
            bucket.delete(key).finally(function(){
              console.log(`Checksum for ${filename} did not match`);
              reject(`Checksum for ${filename} did not match`);
            });
          }
        });
      }
    });
  });
}

export function crandb_store_file(stream, key, filename, metadata){
  return bucket.find({_id : key}, {limit:1}).next().then(function(x){
    if(x){
      console.log(`Already have file ${key} (${filename}). Keeping old one.`);
      return packages.find({_fileid: key}, {limit:1}).next().then(function(doc){
        var oldmd5 = doc ? doc.MD5sum : "unknown";
        return {_id: key, length: x.length, md5: oldmd5, sha256: key};
      });
    } else {
      return store_stream_file(stream, key, filename, metadata);
    }
  });
}

export function mongo_set_progress(universe, pkgname, url){
  var query = {_user : universe, _type : 'src', Package: pkgname};
  return packages.find(query).next().then(function(doc){
    if(doc){
      return packages.updateOne(
        { _id: doc['_id'] },
        { "$set": {"_progress_url": url, "_published": (new Date()) }}
      );
    } else {
      throw createError(404, "No such package yet");
    }
  });
}
