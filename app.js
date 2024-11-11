import path from 'node:path';
import createError from 'http-errors';
import express from 'express';
import logger from 'morgan';
import globalRouter from './routes/global.js';
import universeRouter from './routes/universe.js';
import pkginfoRouter from './routes/pkginfo.js';
import {get_latest} from './src/db.js';

var app = express();

// view engine setup
app.set('views', 'views');
app.set('view engine', 'pug');
//app.set('view cache', true); //enabled by default in prod?

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('static')); //TODO: remove?
app.use('/_global/favicon.ico', express.static('static/favicon.ico'));
app.use('/_global/static', express.static('static'));

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

// precheck if package/universe exists and set caching
app.use('/:package', function(req, res, next){
  const pkg = req.params.package;
  const tabs = ["builds", "packages", "badges", "apis", "datasets", "contributors", "articles"];
  if(pkg == '_global'){
    var query = {};
  } else if (tabs.includes(pkg)){
    var query = {_universes: res.locals.universe}
  } else {
    var query = {_user: res.locals.universe, Package: pkg}
  }
  return get_latest(query).then(function(doc){
    if(doc){
      const etag = `W/"${doc._id}"`;
      const date = doc._published.toUTCString();
      res.set('ETag', etag);
      res.set('Last-Modified', date);
      //clients may cache front-end pages for 60s before revalidating.
      //revalidation can either be done by comparing Etag or Last-Modified.
      //do not set 'must-revalidate' as this will disallow using stale cache when server is offline.
      res.set('Cache-Control', 'public, max-age=60');
      if(etag === req.header('If-None-Match') || date === req.header('If-Modified-Since')){
        //todo: also invalidate for updates in frontend itself
        res.status(304).send();
        return; //no next
      }
    } else {
      //TODO: deal with non existing universe/pkg
      //Move some logic from mongo_package_info() to here
    }
    next();
  });
});

app.use('/_global/', globalRouter);
app.use('/', universeRouter);
app.use('/', pkginfoRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404, `Page not found: ${req.path}`));
});

// global error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = err;
  res.locals.mode = req.app.get('env')

  // render the error page
  res.status(err.status || 500);
  res.header(err.headers);
  res.render('error');
});

export default app;
