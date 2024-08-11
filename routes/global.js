const express = require('express');
const router = express.Router();
const db = require("../src/db.js");

router.get("/_global/search", function(req, res, next){
  res.render("search");
});

module.exports = router;
