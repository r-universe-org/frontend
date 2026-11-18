import http from 'node:http';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import app from '../app.js';

/* Last resort error handler, that should never happen but somehow it sometimes does.
   We quit because in a case of OOM/DOS, a restart may just be the best solution.
   See: https://github.com/r-universe-org/help/issues/310 */
process.on('uncaughtException', function(err, origin) {
  //origin is either 'uncaughtException' (event emitter leak) or
  //'unhandledRejection' (promise without catch), which helps finding the leak
  console.log(`[UNCAUGHT EXCEPTION] pid ${process.pid} (${origin}) ` + (err.stack || err.message));
  process.exit(1);
});

var port = parseInt(process.env.PORT || '3000');
app.set('port', port);

var server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * This must be greater than the nginx timeout (60s)
 * https://shuheikagawa.com/blog/2019/04/25/keep-alive-timeout/
 */
server.keepAliveTimeout = 62*1000;
server.headersTimeout = 65*1000;

/**
 * Log when the event loop gets blocked, to distinguish CPU blocking (high delay)
 * from slow upstreams (normal delay but slow responses) or memory leaks.
 * With the longest requests of the interval (running or finished): the one that
 * blocked the loop is among them, though requests that waited for it are too.
 */
const running = new Map();
let finished = [];
server.on('request', function(req, res){
  const request = {url: `${req.headers.host}${req.url}`.substring(0, 150), start: Date.now()};
  running.set(res, request);
  res.on('close', function(){
    running.delete(res);
    request.ms = Date.now() - request.start;
    finished.push(request);
  });
});

const loopdelay = monitorEventLoopDelay({resolution: 20});
loopdelay.enable();
setInterval(function(){
  const max = loopdelay.max / 1e6;
  if(max > 500){
    const mem = process.memoryUsage();
    const now = Date.now();
    const requests = [...finished, ...Array.from(running.values(), x => ({url: x.url, ms: now - x.start, running: true}))];
    const longest = requests.sort((a, b) => b.ms - a.ms).slice(0, 3)
      .map(x => `${x.url} ${x.ms}ms${x.running ? ' (running)' : ''}`).join(', ');
    console.log(`[EVENT LOOP DELAY] pid ${process.pid} max ${max.toFixed(0)}ms p99 ${(loopdelay.percentile(99) / 1e6).toFixed(0)}ms ` +
      `rss ${(mem.rss / 1e6).toFixed(0)}MB heap ${(mem.heapUsed / 1e6).toFixed(0)}MB longest: ${longest}`);
  }
  finished = [];
  loopdelay.reset();
}, 10000).unref();

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log('Listening on ' + bind);
}
