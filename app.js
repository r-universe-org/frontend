import fs from 'node:fs';
import path from 'node:path';
import createError from 'http-errors';
import express from 'express';
import logger from 'morgan';
import cors from 'cors';
import cdnRouter from './routes/cdn.js';
import prepareRouter from './routes/prepare.js';
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

app.use(cors())
app.use(logger('dev'));

//log errors to file
logger.token('host', function (req, res) { return req.hostname })
const errorLog = fs.createWriteStream('logs/frontend.log', { flags: 'a' });
app.use(logger('[:date[iso]] :status :method :host:url (:response-time ms) :user-agent', {
  stream: errorLog,
  skip: function (req, res) { return res.statusCode < 400 || req.path.endsWith('PACKAGES.rds') }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('static', {maxAge: '1d'})); //TODO: remove?
app.use('/_global/favicon.ico', express.static('static/favicon.ico'));
app.use('/_global/robots.txt', express.static('static/robots.txt'));
app.use('/_global/static', express.static('static', {maxAge: '1d'}));

//routers
app.use('/cdn', cdnRouter);
app.use('/', prepareRouter);
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
