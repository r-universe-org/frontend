import path from 'node:path';
import createError from 'http-errors';
import express from 'express';
import logger from 'morgan';
import globalRouter from './routes/global.js';
import apiRouter from './routes/api.js';
import universeRouter from './routes/universe.js';
import pkginfoRouter from './routes/pkginfo.js';
import pkgdataRouter from './routes/pkgdata.js';

import {get_latest} from './src/db.js';

const production = process.env.NODE_ENV == 'production';
const app = express();

// Prettify all JSON responses
app.set('json spaces', 2);

// view engine setup
app.set('views', 'views');
app.set('view engine', 'pug');
//app.set('view cache', true); //enabled by default in prod?

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('static', {maxAge: '1d'})); //TODO: remove?
app.use('/_global/favicon.ico', express.static('static/favicon.ico'));
app.use('/_global/static', express.static('static', {maxAge: '1d'}));

// remove trailing slashes
app.use((req, res, next) => {
  if (req.path.slice(-1) === '/' && req.path.length > 1) {
    const query = req.url.slice(req.path.length)
    const safepath = req.path.slice(0, -1).replace(/\/+/g, '/')
    res.redirect(301, safepath + query)
  } else {
    next()
  }
})

// set pug globals for 'universe' and 'node_env'
app.use(function(req, res, next){
  if(process.env.UNIVERSE){
    req.universe = process.env.UNIVERSE;
  } else if(req.app.get('env') === 'production'){
    req.universe = req.hostname.replace('.r-universe.dev', '');
    res.locals.vhost = req.headers['r-universe-vhost'];
  }
  res.locals.universe = req.universe || 'ropensci';
  res.locals.node_env = req.app.get('env');
  next();
});

// check if package/universe exists and handle caching values
app.use('/{:package}', function(req, res, next){
  if(!production){
    res.set('Cache-Control', 'no-cache');
    return next();
  }
  const universe = res.locals.universe;
  const pkg = req.params.package || "";
  const reserved = ["", "api","apis","articles","badges","bin","builds","citation","contributors","datasets","docs",
    "favicon.ico","feed.xml","index.xml","manual","packages","readme","robots.txt","sitemap_index.xml",
    "sitemap.xml","src","stats", ""] ;
  const metapage = reserved.includes(pkg);
  if(pkg == '_global'){
    var query = {};
    var cdn_cache = 3600;
  } else if (metapage){
    var query = {_universes: universe};
    var cdn_cache = 60;
  } else {
    var query = {_user: universe, Package: pkg, _registered: true}; //remotes dont have webpage
    var cdn_cache = 30;
  }
  return get_latest(query).then(function(doc){
    //Using 'CDN-Cache-Control' would make nginx also do this and we'd need to refresh twice?
    //Switch back when fixed in cloudflare: https://community.cloudflare.com/t/support-for-stale-while-revalidate/496788/35
    //res.set('Cloudflare-CDN-Cache-Control', `public, max-age=60, stale-while-revalidate=${cdn_cache}`);
    //res.set('Cache-Control', 'public, max-age=60');
    //also cache 404 errors below
    res.set('Cache-Control', `public, max-age=60, stale-while-revalidate=${cdn_cache}`);

    if(doc){
      const etag = `W/"${doc._id}"`;
      const date = doc._published.toUTCString();
      res.set('ETag', etag);
      res.set('Last-Modified', date);
      //clients may cache front-end pages for 60s before revalidating.
      //revalidation can either be done by comparing Etag or Last-Modified.
      //do not set 'must-revalidate' as this will disallow using stale cache when server is offline.
      if(etag === req.header('If-None-Match') || date === req.header('If-Modified-Since')){
        //todo: also invalidate for updates in frontend itself?
        res.status(304).send();
      } else {
        next(); //proceed to routing
      }
    } else if(metapage) {
      throw createError(404, `Universe not found: ${universe}`);
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
});

app.use('/_global/', globalRouter);
app.use('/', apiRouter);
app.use('/', universeRouter);
app.use('/', pkginfoRouter);
app.use('/', pkgdataRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404, `Page not found: ${req.path}`));
});

// global error handler
app.use(function(err, req, res, next) {
  res.locals.error = err;
  res.locals.mode = req.app.get('env')

  // render the error page
  res.status(err.status || 500);
  res.header(err.headers);
  res.type('text/html');
  res.render('error');
});

export default app;
