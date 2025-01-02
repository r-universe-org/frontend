import path from 'node:path';
import createError from 'http-errors';
import express from 'express';
import logger from 'morgan';
import cacheRouter from './routes/cache.js';
import globalRouter from './routes/global.js';
import apiRouter from './routes/api.js';
import reposRouter from './routes/repos.js';
import universeRouter from './routes/universe.js';
import badgesRouter from './routes/badges.js';
import pkginfoRouter from './routes/pkginfo.js';
import pkgdataRouter from './routes/pkgdata.js';

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

// check if package/universe exists and handle caching
app.use('/{:package}', cacheRouter);
app.use('/_global/', globalRouter);
app.use('/', apiRouter);
app.use('/', reposRouter);
app.use('/', universeRouter);
app.use('/', badgesRouter);
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
