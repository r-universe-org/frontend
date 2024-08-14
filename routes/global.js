const express = require('express');
const router = express.Router();
const db = require("../src/db.js");

function rnd(max){
  return Math.floor(Math.random() * max);
}

router.get("/_global/search", function(req, res, next){
  res.render("search");
});

router.get("/_global/activity", function(req, res, next){
  res.render("activity");
});

router.get("/_global/organizations", function(req, res, next){
  db.get_organizations().then(function(orgs){
    res.render('organizations', {orgs: orgs});
  }).catch(next);
});

router.get("/_global/galaxy", function(req, res, next){
  db.get_organizations().then(function(orgs){
    res.render('galaxy', {rnd: rnd, orgs: orgs.slice(0, 250)});
  }).catch(next);
});

module.exports = router;
