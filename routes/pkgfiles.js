import express from 'express';
import url from 'node:url';
import {get_package_info} from '../src/db.js';

/* WIP */

const router = express.Router();

router.get("/:package/json", function(req, res, next) {
  res.redirect(301, `/api/packages/${req.params.package}`);
});


router.get('/:package/files', function(req, res, next) {
  
});

router.get('/:package/buildlog', function(req, res, next) {
  
});

router.get('/:package/DESCRIPTION', function(req, res, next) {
  
});


export default router;
