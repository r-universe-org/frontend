export default function(req, res, next){
  //remove trailing slashes except for root
  if (req.path.slice(-1) === '/' && req.path.length > 1) {
    const query = req.url.slice(req.path.length)
    const safepath = req.path.slice(0, -1).replace(/\/+/g, '/')
    return res.redirect(301, safepath + query);
  }

  //set universe globals
  if(process.env.UNIVERSE){
    req.universe = process.env.UNIVERSE;
  } else if(req.app.get('env') === 'production'){
    req.universe = req.hostname.replace('.r-universe.dev', '');
    res.locals.vhost = req.headers['r-universe-vhost'];
  }
  res.locals.universe = req.universe || 'ropensci';
  res.locals.node_env = req.app.get('env');
  next();
}
