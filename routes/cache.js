import createError from 'http-errors';
import {get_latest} from '../src/db.js';

// Top-level pages that get the last-modified date of the universe, rather than of a package
export const reserved = ["", "api", "src", "bin", "stats", "articles", "builds", "packages",
  "badges","contributors","datasets", "favicon.ico","feed.xml","index.xml", "robots.txt",
  "sitemap_index.xml", "sitemap_universe.xml", "sitemap.xml", "sitemaps.xml", "card.png", "card.svg"];

// Top-level pages of r-universe.dev, which nginx serves from /_global (the first four it serves
// itself). Other pages are rejected here, and by the edge worker via /_global/api/allowlist.
export const global_pages = ["", "scores", "manuals", "webhook", "search", "activity", "builds",
  "organizations", "repositories", "articles", "datasets", "packages", "sysdeps", "galaxy", "welcome",
  "sitemap_index.xml", "sitemap.xml", "sitemaps.xml", "condastatus", "mongostatus", "cranstatus",
  "redirect", "api", "stats", "favicon.ico", "robots.txt", "static"];

// The ETag of pages is based on the last time the universe or package was published.
// Also used by /api/etags so the edge worker can revalidate pages without us.
const revision = 41; // bump to invalidate all caches
export function cache_time(published){
  return published.getTime() + revision * 1000;
}
export function make_etag(published){
  return `W/"${cache_time(published)}"`;
}

// Pages with their own Cache-Control. It is set here, so that 304 responses get it too: these
// update the headers of a cached page. Pages with revalidate: false do not come from our db,
// so they get no ETag (nor existence check), and are refreshed after max-age instead.
function page_cache_policy(pkg, req){
  if(pkg == 'api' && req.path == '/allowlist'){
    //the edge worker loads this for every universe, and it changes rarely
    return {cache_control: 'public, max-age=300, stale-while-revalidate=3600'};
  }
  if(pkg == 'api' && req.path == '/summary'){
    //loaded on every page and changes slowly: refresh in the background, like the global pages
    return {cache_control: 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400'};
  }
  if(pkg == '_global' && req.path == '/api/allowlist'){
    //the pages of r-universe.dev: these only change with the code, not with the db
    return {cache_control: 'public, max-age=300, stale-while-revalidate=3600', revalidate: false};
  }
  if(pkg == '_global' && /^\/(cran|conda)status\//.test(req.path)){
    //data from CRAN and conda-forge, which can be slow or down: serve stale while refreshing in the
    //background, and when the refresh fails (server errors are not cached, see routes/global.js).
    //No s-maxage: cloudflare does not serve stale content with it.
    return {cache_control: 'public, max-age=3600, stale-while-revalidate=604800, stale-if-error=2592000', revalidate: false};
  }
  if(pkg == '' && req.path == '/' && !req.query['list-type'] && !req.query['x-id']){
    //the homepage depends on the Accept header, and Vary does not work in cloudflare currently
    return {cache_control: 'private, max-age=86400'};
  }
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
    if(!global_pages.includes(req.path.split('/')[1].toLowerCase())){
      res.set('Cache-Control', 'public, max-age=600');
      return next(createError(404, "Page not found."));
    }
    var query = {};
    var max_age = req.path.includes("/builds") ? 60 : 600;
    //these pages are slow to generate, and change with every publish anywhere (so revalidation
    //rarely gives a 304): refresh in the background, and serve stale for at most an hour
    var stale = ', stale-while-revalidate=3600, stale-if-error=3600';
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
  const policy = page_cache_policy(pkg, req);
  if(policy && policy.revalidate === false){
    res.set('Cache-Control', policy.cache_control);
    res.set('Cache-Tag', cache_tag);
    return next();
  }
  return get_latest(query).then(function(doc){
    //Using 'CDN-Cache-Control' would make nginx also do this and we'd need to refresh twice?
    //Switch back when fixed in cloudflare: https://community.cloudflare.com/t/support-for-stale-while-revalidate/496788/35
    //res.set('Cloudflare-CDN-Cache-Control', `public, max-age=60, stale-while-revalidate=${cdn_cache}`);
    //res.set('Cache-Control', 'public, max-age=60');
    //also cache 404 errors below
    res.set('Cache-Control', policy ? policy.cache_control : `public, max-age=${max_age}${stale || ''}`);
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
