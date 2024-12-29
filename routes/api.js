import express from 'express';
import url from 'node:url';
import {ls_packages} from '../src/db.js';

const router = express.Router();

router.get('/api', function(req, res, next) {
  res.redirect(301, `/api/ls`);
});

router.get('/api/ls', function(req, res, next) {
  ls_packages(res.locals.universe).then(x => res.send(x));
});


export default router;
