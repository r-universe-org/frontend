const express = require('express');
const router = express.Router();
const db = require("../src/db.js");

function rnd(max){
  return Math.floor(Math.random() * max);
}

function format_yymmdd(x){
  const date = new Date(x || NaN);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

router.get("/_global/repositories", function(req, res, next){
  db.get_repositories().then(function(repos){
    res.render('repositories', {repos: repos, format_yymmdd: format_yymmdd});
  });
});

router.get("/_global/galaxy", function(req, res, next){
  db.get_organizations().then(function(orgs){
    res.render('galaxy', {rnd: rnd, orgs: orgs.slice(0, 250)});
  }).catch(next);
});

module.exports = router;
