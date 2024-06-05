/* Database */
const mongodb = require('mongodb');
const createError = require('http-errors');
const HOST = process.env.CRANLIKE_MONGODB_SERVER || '127.0.0.1';
const PORT = process.env.CRANLIKE_MONGODB_PORT || 27017;
const USER = process.env.CRANLIKE_MONGODB_USERNAME || 'root';
const PASS = process.env.CRANLIKE_MONGODB_PASSWORD;
const AUTH = PASS ? (USER + ':' + PASS + "@") : "";
const URL = 'mongodb://' + AUTH + HOST + ':' + PORT;
const production = process.env.NODE_ENV == 'production';
var mongo_find;
var mongo_aggregate;

if(production){
  console.log("Connecting to database....")
  const connection = mongodb.MongoClient.connect(URL);
  connection.then(function(client) {
    console.log("Connected to MongoDB!")
    const db = client.db('cranlike');
    const col = db.collection('packages');
    mongo_find = function(q){
      if(!col)
        throw new Error("No mongodb connection available.");
      return col.find(q);
    }
    mongo_aggregate = function(q){
      if(!col)
        throw new Error("No mongodb connection available.");
      return col.aggregate(q);
    }
  }).catch(function(error){
    console.log("Failed to connect to mongodb!\n" + error)
    throw error;
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

function build_projection(fields){
  var projection = {Package:1, _type:1, _user:1, _indexed: 1, _id:0};
  fields.forEach(function (f) {
    projection[f] = 1;
  });
  return projection;
}

function mongo_package_info(package, universe){
  return mongo_find({_user: universe, Package: package}).toArray().then(function(docs){
    if(docs.length){
      return group_package_data(docs);
    } else {
      // Try to find pkg elsewhere...
      var altquery = {
        _type: 'src',
        Package : {$regex: `^${package}$`, $options: 'i'},
        '$or' : [{'_universes': universe}, {'_indexed': true}]
      }
      return mongo_find(altquery).next().then(function(alt){
        if(alt){
          throw createError(301, `Package has moved...`, {headers : {
            location: `https://${alt._user}.r-universe.dev/${alt.Package}`
          }});
        } else {
          throw createError(404, `Package ${package} not found in ${universe}`)
        }
      });
    }
  });
}

function mongo_universe_packages(user, fields, all){
  var query = all ? {'_universes': user} : {'_user': user};
  if(user == ":any" || user == 'cran'){
    query['_commit.time'] = {'$gt': days_ago(7)};
  }
  var projection = build_projection(fields);
  var cursor = mongo_aggregate([
    {$match: query},
    {$project: projection},
    {$group : {
      _id : {'Package': '$Package', 'user':'$_user'},
      indexed: { $addToSet: "$_indexed" },
      timestamp: { $max : "$_commit.time" },
      files: { '$push': '$$ROOT' }
    }},
    {$match: {'$or' : [{indexed: true}, {'_id.user': user}]}},
    {$sort : {timestamp : -1}},
    {$limit : 2500}
  ]);
  return cursor.toArray().then(function(pkglist){
    if(!pkglist.length)
      throw createError(404, `No packages found in this universe: ${user}`)
    return pkglist.map(x => group_package_data(x.files));
  });
}

function mongo_universe_vignettes(user){
  var limit = 200;
  var cursor = mongo_aggregate([
    {$match: {_universes: user, _type: 'src', '_vignettes' : {$exists: true}}},
    {$sort : {'_commit.time' : -1}},
    {$limit : limit},
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

function get_package_info(package, universe){
  if(production){
    return mongo_package_info(package, universe);
  } else {
    console.warn(`Fetching ${package} info from API...`)
    if(universe){
      return get_json(`https:${universe}.r-universe.dev/api/packages/${package}`);
    } else {
      return get_json(`https://cran.dev/${package}/json`);
    }
  }
}

function get_universe_vignettes(universe){
  if(production){
    return mongo_universe_vignettes(universe)
  } else {
    console.warn(`Fetching ${universe} vignettes from API...`)
    return get_ndjson(`https://${universe}.r-universe.dev/stats/vignettes?all=true`)
  }
}

function get_universe_packages(universe, fields, all = true){
  if(production){
    return mongo_universe_packages(universe, fields, all)
  } else {
    console.warn(`Fetching ${universe} packages from API...`)
    var apiurl = `https://${universe}.r-universe.dev/api/packages?fields=${fields.join()}&limit=2500${all ? '&all=true' : ''}`;
    return get_json(apiurl)
  }
}

module.exports = {
  get_package_info: get_package_info,
  get_universe_packages: get_universe_packages,
  get_universe_vignettes: get_universe_vignettes
};
