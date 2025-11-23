import path from 'node:path';
import createError from 'http-errors';
import {get_latest} from '../src/db.js';

// check if package/universe exists and handle caching
export default function(req, res, next){
  const production = req.app.get('env') === 'production';
  if(!production){
    res.set('Cache-Control', 'no-cache');
    return next();
  }
  const universe = res.locals.universe;
  const pkg = req.params.package || "";
  const reserved = ["", "api","apis","articles","badges","bin","builds","citation","contributors","datasets","docs",
    "favicon.ico","feed.xml","index.xml","manual","packages","readme","robots.txt", "shared", "sitemap_index.xml",
    "sitemap.xml","src","stats"] ;
  const metapage = reserved.includes(pkg);
  if(pkg == '_global'){
    var query = {};
    var max_age = req.path.includes("_global/builds") ? 60 : 600;
    var cdn_cache = req.path.includes("_global/builds") ? 60 : 3600;
  } else if (metapage){
    var query = {_universes: universe};
    var max_age = universe == 'cran' ? 600 : 60;
    var cdn_cache = 60;
  } else {
    var query = {_user: universe, Package: pkg, _registered: true}; //remotes dont have webpage
    var max_age = 60;
    var cdn_cache = 30;
  }
  return get_latest(query).then(function(doc){
    //Using 'CDN-Cache-Control' would make nginx also do this and we'd need to refresh twice?
    //Switch back when fixed in cloudflare: https://community.cloudflare.com/t/support-for-stale-while-revalidate/496788/35
    //res.set('Cloudflare-CDN-Cache-Control', `public, max-age=60, stale-while-revalidate=${cdn_cache}`);
    //res.set('Cache-Control', 'public, max-age=60');
    //also cache 404 errors below
    res.set('Cache-Control', `public, max-age=${max_age}`);
    //res.set('Cache-Control', `public, max-age=${max_age}, stale-while-revalidate=${cdn_cache}`);

    if(doc){
      const revision = 30; // bump to invalidate all caches
      const etag = `W/"${doc._id}${revision}"`;
      const date = new Date(doc._published.getTime() + revision * 1000).toUTCString();
      res.set('ETag', etag);
      res.set('Last-Modified', date);
      //clients may cache front-end pages for 60s before revalidating.
      //revalidation can either be done by comparing Etag or Last-Modified.
      //do not set 'must-revalidate' as this will disallow using stale cache when server is offline.
      if(etag === req.header('If-None-Match') || date === req.header('If-Modified-Since')){
        res.status(304).send();
      } else {
        next(); //proceed to routing
      }
    } else if(metapage) {
      throw createError(404, `No packages found for this owner or maintainer: ${universe}`);
    } else {
      // Try to find case insensitive or in other universe
      var altquery = {_type: 'src', _nocasepkg: pkg.toLowerCase(), _universes: universe, _registered: true};
      return get_latest(altquery).then(function(alt){
        if(!alt)
          throw createError(404, `Package ${pkg} not found in ${universe}`);
        res.redirect(`https://${alt._user}.r-universe.dev/${alt.Package}${req.path.replace(/\/$/, '')}`);
      });
    };
  });
};
