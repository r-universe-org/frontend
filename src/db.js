import {MongoClient, GridFSBucket} from 'mongodb';
import {Readable} from  "node:stream";
import {pkgfields} from './tools.js';
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
const client = production && await MongoClient.connect(URL);
const db = production && client.db('cranlike');
const bucket = production && new GridFSBucket(db, {bucketName: 'files'});
const packages = production && db.collection('packages');
const chunks = production && db.collection('files.chunks');
console.log("Connected to MongoDB!");

function mongo_latest(q){
  if(!packages || !packages.find)
    throw new Error("No mongodb connection available.");
  return packages.findOne(q, {sort:{_id: -1}, project: {_id: 1, _published: 1, _user: 1, Package: 1}});
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
  let query = {_type: 'src'};
  if(universe != '_global')
    query._user = universe;
  return packages.distinct('Package', query);
}

function mongo_distinct(key, query){
  if(!packages || !packages.aggregate)
    throw new Error("No mongodb connection available.");
  return packages.distinct(key, query);
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
    src._failure = {
      version: failure.Version,
      commit: failure._commit,
      buildurl: failure._buildurl,
      date: failure._created
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

function get_text(url){
  return get_url(url).then((res) => res.text());
}

function get_ndjson(url){
  return get_text(url).then(txt => txt.split('\n').filter(x => x.length).map(JSON.parse));
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

function build_projection(fields){
  var projection = {Package:1, _type:1, _user:1, _indexed: 1, _id:0};
  fields.forEach(function (f) {
    projection[f] = 1;
  });
  return projection;
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
  if(query['$or']){
    options.sort = {_type: 1}; //prefer linux binary over src packages
  }
  var options = {project: {_fileid: 1, Version: 1}};
  return packages.findOne(query, options).then(function(x){
    if(!x)
      throw createError(404, 'Package not found for query: ' + JSON.stringify(query));
    return x;
  });
}

//TODO: this is heavy because we also query all binaries which we dont use currently
function mongo_universe_packages(user, fields, limit){
  var query = {'_universes': user};
  var projection = build_projection(fields);
  var postmatch = {'$or': [{indexed: true}, {'_id.user': user}]};
  if(user == 'cran'){
    postmatch = {indexed: true}; //only list indexed cran packages
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

function mongo_all_universes(organizations_only){
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
      indexed:1, name: 1, type: 1, bio: 1, maintainers: { $size: '$emails' },
    }},
    {$sort:{ indexed: -1}}
  ]);
  return cursor.toArray();
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
    contributors: array_size({$objectToArray: '$_contributions'}),
    datasets: array_size('$_datasets'),
    vignettes: array_size('$_vignettes'),
    releases: array_size('$_releases')
  }
  var cursor = mongo_find(query).sort({_score: -1}).project(projection);
  return cursor.toArray();
}

function mongo_all_sysdeps(distro){
  var query = {_type: 'src', '_sysdeps': {$exists: true}};
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
  return cursor.toArray();
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

function mongo_package_stream(pkg, universe){
  var query = {Package: pkg, _user: universe, _type: 'src'};
  return packages.findOne(query, {sort: {'_id': -1}}).then(function(x){
    if(!x)
      throw `Package ${pkg} not found in ${universe}`;
    return bucket.openDownloadStream(x._fileid);
  });
}

export function get_package_info(pkg, universe){
  if(production){
    return mongo_package_info(pkg, universe);
  } else {
    console.warn(`Fetching ${pkg} info from API...`)
    if(universe){
      return get_json(`https://${universe}.r-universe.dev/api/packages/${pkg}`);
    } else {
      return get_json(`https://cran.dev/${pkg}/json`);
    }
  }
}

export function list_package_files(pkg, universe){
  if(production){
    return mongo_package_files(pkg, universe);
  } else {
    console.warn(`Fetching ${pkg} files from API...`)
    if(universe){
      return get_json(`https://${universe}.r-universe.dev/${pkg}/files`);
    } else {
      return get_json(`https://cran.dev/${pkg}/files`);
    }
  }
}

export function get_package_stream(pkg, universe){
  if(production){
    return mongo_package_stream(pkg, universe);
  } else {
    return get_package_info(pkg, universe).then(function(x){
      return get_url(`https://cdn.r-universe.dev/${x._fileid}`).then(res => Readable.fromWeb(res.body));
    });
  }
}

export function get_universe_vignettes(universe){
  if(production){
    return mongo_universe_vignettes(universe)
  } else {
    console.warn(`Fetching ${universe} vignettes from API...`)
    return get_ndjson(`https://${universe}.r-universe.dev/stats/vignettes?all=true`)
  }
}

export function get_universe_packages(universe, fields, limit = 5000){
  if(production){
    return mongo_universe_packages(universe, fields, limit)
  } else {
    console.warn(`Fetching ${universe} packages from API...`)
    var apiurl = `https://${universe}.r-universe.dev/api/packages?stream=1&all=true&limit=${limit}&fields=${fields.join()}`;
    return get_ndjson(apiurl)
  }
}

export function get_universe_binaries(universe, type){
  if(production){
    return mongo_universe_binaries(universe, type);
  } else {
    throw "Not implemented for devel";
  }
}

export function get_repositories(){
  if(production){
    return mongo_all_universes()
  } else {
    console.warn(`Fetching universes data from API...`);
    return get_ndjson(`https://r-universe.dev/api/universes?stream=1`);
  }
}

export function get_scores(){
  if(production){
    return mongo_all_scores()
  } else {
    console.warn(`Fetching scores data from API...`);
    return get_ndjson(`https://r-universe.dev/api/scores?stream=1`);
  }
}

export function get_organizations(){
  if(production){
    return mongo_all_universes(true);
  } else {
    console.warn(`Fetching universes data from API...`);
    return get_ndjson(`https://r-universe.dev/api/universes?type=organization&skipcran=1&stream=1`);
  }
}

export function get_sysdeps(){
  if(production){
    return mongo_all_sysdeps()
  } else {
    console.warn(`Fetching sysdeps data from API...`);
    return get_ndjson(`https://r-universe.dev/stats/sysdeps?all=1`);
  }
}

export function get_builds(){
  if(production){
    return mongo_recent_builds()
  } else {
    console.warn(`Fetching builds data from API...`);
    return get_ndjson(`https://r-universe.dev/stats/builds?limit=1000`);
  }
}

export function get_articles(){
  if(production){
    return mongo_all_articles()
  } else {
    console.warn(`Fetching articles data from API...`);
    return get_ndjson(`https://r-universe.dev/api/articles?stream=1`);
  }
}

export function get_datasets(){
  if(production){
    return mongo_all_datasets()
  } else {
    console.warn(`Fetching datasets from API...`);
    return get_ndjson(`https://r-universe.dev/api/datasets?stream=1`);
  }
}

export function get_latest(query){
  if(production){
    return mongo_latest(query);
  } else {
    throw "Not implemented for devel";
  }
}

export function get_packages_index(query, fields = [], mixed = false){
  if(production){
    let projection = {...pkgfields};
    fields.forEach(function (f) {
      console.log("adding", f)
      projection[f] = 1;
    });
    var cursor = mixed ? mongo_aggregate([
      {$match: query},
      {$sort: {_type: 1}},
      {$group : {
        _id : {'Package': '$Package'},
        doc: { '$first': '$$ROOT' }
      }},
      {$replaceRoot: { newRoot: '$doc' }}
    ]) : mongo_find(query);
    return cursor.project(projection).sort({"Package" : 1});
  } else {
    throw "Not implemented for devel";
  }
}

export function get_package_hash(query){
  if(production){
    return mongo_package_hash(query);
  } else {
    throw "Not implemented for devel";
  }
}

export function get_distinct(key, query){
  if(production){
    return mongo_distinct(key, query);
  } else {
    throw "Not implemented for devel";
  }
}

export function get_aggregate(pipeline){
  if(production){
    return mongo_aggregate(pipeline);
  } else {
    throw "Not implemented for devel";
  }
}

export function ls_packages(universe){
  if(production){
    return mongo_ls_packages(universe);
  } else {
    throw "Not implemented for devel";
  }
}
