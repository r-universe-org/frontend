var express = require('express');
var router = express.Router();

/* Langing page (TODO) */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'R-universe' });
});

router.get('/:package', function(req, res, next) {
  res.render('pkginfo', { title: req.params.package });
});

module.exports = router;
