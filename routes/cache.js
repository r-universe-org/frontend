import createError from 'http-errors';
import {get_latest} from '../src/db.js';

// Top-level pages that get the last-modified date of the universe, rather than of a package
export const reserved = ["", "api", "src", "bin", "stats", "articles", "builds", "packages",
  "badges","contributors","datasets", "favicon.ico","feed.xml","index.xml", "robots.txt",
  "sitemap_index.xml", "sitemap_universe.xml", "sitemap.xml", "sitemaps.xml", "card.png", "card.svg"];

// The ETag of pages is based on the last time the universe or package was published.
// Also used by /api/etags so the edge worker can revalidate pages without us.
const revision = 41; // bump to invalidate all caches
export function cache_time(published){
  return published.getTime() + revision * 1000;
}
export function make_etag(published){
  return `W/"${cache_time(published)}"`;
}

// check if package/universe exists and handle caching
export default function(req, res, next){
  if(req.method != 'GET' && req.method != 'HEAD'){
    //do not validate universe existence for new uploads.
    return next();
  }
  const production = req.app.get('env') === 'production';
  if(!production){
    res.set('Cache-Control', 'no-store');
    return next();
  }
  const universe = res.locals.universe;
  const pkg = req.params.package || "";
  const metapage = reserved.includes(pkg);
  if(pkg == '_global'){
    var query = {};
    var max_age = req.path.includes("/builds") ? 60 : 600;
    var cache_tag = 'global';
    //var cdn_cache = req.path.includes("_global/builds") ? 60 : 3600;
  } else if (metapage){
    var query = {_universes: universe};
    var max_age = universe == 'cran' ? 600 : 60;
    var cache_tag = 'universe';
    //var cdn_cache = 60;
  } else {
    var query = {_user: universe, Package: pkg, _registered: true}; //remotes dont have webpage
    var max_age = 61;
    var cache_tag = 'package';
    //var cdn_cache = 30;
  }
  return get_latest(query).then(function(doc){
    //Using 'CDN-Cache-Control' would make nginx also do this and we'd need to refresh twice?
    //Switch back when fixed in cloudflare: https://community.cloudflare.com/t/support-for-stale-while-revalidate/496788/35
    //res.set('Cloudflare-CDN-Cache-Control', `public, max-age=60, stale-while-revalidate=${cdn_cache}`);
    //res.set('Cache-Control', 'public, max-age=60');
    //also cache 404 errors below
    res.set('Cache-Control', `public, max-age=${max_age}`);
    res.set('Cache-Tag', cache_tag);
    //res.set('Cache-Control', `public, max-age=${max_age}, stale-while-revalidate=${cdn_cache}`);

    if(doc){
      const etag = make_etag(doc._published);
      const date = new Date(cache_time(doc._published)).toUTCString();
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
