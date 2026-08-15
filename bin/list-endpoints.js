#!/usr/bin/env node
/* Lists all endpoints implemented in this express app, for whitelisting in the CDN.
   Statically parses app.js and the route files, so it does not need a database. */

import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const appjs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// Map imported router names to their source files
const importre = /import\s+(\w+)\s+from\s+'(\.\/routes\/[\w-]+\.js)'/g;
const routers = {};
for (const m of appjs.matchAll(importre)) {
  routers[m[1]] = m[2];
}

// Find app.use(mount, router) calls, in mounting order
const usere = /app\.use\(\s*'([^']*)'\s*,\s*(\w+)\s*\)/g;
const mounts = [];
for (const m of appjs.matchAll(usere)) {
  if (routers[m[2]]) {
    mounts.push({ mount: m[1], name: m[2], file: routers[m[2]] });
  }
}
// app.use(router) without a mount path
const bareusere = /app\.use\(\s*(\w+)\s*\)/g;
for (const m of appjs.matchAll(bareusere)) {
  if (routers[m[1]]) {
    mounts.push({ mount: '/', name: m[1], file: routers[m[1]] });
  }
}

// Static file mounts: app.use(mount, express.static(target)); a directory target serves the whole tree
const staticre = /app\.use\(\s*'([^']*)'\s*,\s*express\.static\(\s*'([^']*)'/g;
const staticmounts = [...appjs.matchAll(staticre)].map(function(m) {
  const isdir = fs.statSync(path.join(root, m[2])).isDirectory();
  return isdir ? joinpath(m[1], '/*') : m[1];
});

function joinpath(mount, route) {
  const joined = ('/' + mount + '/' + route).replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

// Extract router.<method>('<path>') and router.<method>(['<p1>', '<p2>']) definitions
function extract(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const routere = /router\.(get|post|put|delete|patch|head|options|all)\(\s*('[^']*'|"[^"]*"|\[[^\]]*\])/g;
  const out = [];
  for (const m of src.matchAll(routere)) {
    const method = m[1].toUpperCase();
    // unescape JS string literals, e.g. '\\:' in source is '\:' (a literal colon) in the express pattern
    const paths = [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map(p => (p[1] ?? p[2]).replace(/\\\\/g, '\\'));
    for (const p of paths) {
      out.push({ method, path: p });
    }
  }
  return out;
}

// Convert an express-5 route pattern to cloudflare wildcard glob(s).
// Optional groups {...} cannot be expressed in a glob, so expand both variants.
function globify(pattern) {
  const optional = pattern.match(/\{[^}]*\}/);
  if (optional) {
    const without = pattern.replace(optional[0], '');
    const with_ = pattern.replace(optional[0], optional[0].slice(1, -1));
    return [...globify(without), ...globify(with_)];
  }
  const glob = pattern
    .replace(/\\:/g, '\0')   // literal colon
    .replace(/:\w+/g, '*')   // params, e.g. :package
    .replace(/\*\w+/g, '*')  // splats, e.g. *path
    .replace(/\0/g, ':')
    .replace(/\*+/g, '*');
  return [glob];
}

let entries = [];
for (const mount of staticmounts) {
  entries.push({ method: 'GET', pattern: mount, file: 'static' });
}
for (const { mount, file } of mounts) {
  for (const { method, path: routepath } of extract(file)) {
    entries.push({ method, pattern: joinpath(mount, routepath), file });
  }
}

const globmode = process.argv.includes('--glob');
const jsonmode = process.argv.includes('--json');
const fullmode = process.argv.includes('--full');

// Only show GET endpoints by default; pass --all to include the write API
if (!process.argv.includes('--all')) {
  entries = entries.filter(e => e.method === 'GET');
}

// Truncate a glob to its first path segment, up to the first dot or slash.
// The CDN allows any listed entry followed by a dot, slash, or nothing.
function depth1(glob) {
  const seg = glob.slice(1).split(/[/.]/)[0];
  // a trailing wildcard is covered by the dot/slash/nothing rule, except for a pure catch-all
  return '/' + (seg === '*' ? seg : seg.replace(/\*.*$/, ''));
}

// By default reduce patterns to depth 1; pass --full for complete paths
function convert(pattern) {
  const globs = (globmode || jsonmode || !fullmode) ? globify(pattern) : [pattern];
  return fullmode ? globs : globs.map(depth1);
}

if (jsonmode) {
  /* Group endpoints by where they are mounted on r-universe.dev:
     - global: served on the top-level domain https://r-universe.dev/*, without the /_global prefix
     - package: served on universe subdomains under https://{universe}.r-universe.dev/{package}/*
     - universe: fixed paths on universe subdomains, e.g. https://{universe}.r-universe.dev/builds */
  const groups = { global: new Set(), universe: new Set(), package: new Set() };
  for (const { pattern } of entries) {
    if (pattern.startsWith('/_global')) {
      const stripped = pattern.replace(/^\/_global\/?/, '/');
      convert(stripped).forEach(g => groups.global.add(g));
    } else if (pattern.startsWith('/:package')) {
      const stripped = pattern.replace(/^\/:package\/?/, '/');
      convert(stripped).forEach(g => groups.package.add(g));
    } else {
      convert(pattern).forEach(g => groups.universe.add(g));
    }
  }
  console.log(JSON.stringify({
    global: [...groups.global].sort(),
    universe: [...groups.universe].sort(),
    package: [...groups.package].sort()
  }, null, 2));
} else {
  const seen = new Set();
  for (const { method, pattern, file } of entries) {
    for (const p of convert(pattern)) {
      const line = globmode ? p : `${method}\t${p}\t(${file})`;
      if (!seen.has(line)) {
        seen.add(line);
        console.log(line);
      }
    }
  }
}
