import createError from 'http-errors';

/* Download statistics from the edge worker (https://github.com/r-universe-org/edge-worker),
   which counts hits in Cloudflare Workers Analytics Engine. The SQL API always requires an
   API token with "Account Analytics: Read", so we query it here to make the stats public.
   CF_ANALYTICS_ID is the Cloudflare account id, CF_ANALYTICS_TOKEN the token. */

/* Downloads per package and platform in the last 'days' days, as rows of {package, platform,
   downloads}. Package names are lowercase. Data is kept for three months. */
export function get_downloads(universe, days){
  const account = process.env.CF_ANALYTICS_ID;
  const token = process.env.CF_ANALYTICS_TOKEN;
  if(!account || !token){
    return Promise.reject(createError(503, 'Download stats are not available (no CF_ANALYTICS_ID or CF_ANALYTICS_TOKEN)'));
  }
  // The SQL API has no query parameters: only use validated values in the query
  if(!/^[a-z0-9-]+$/i.test(universe) || !Number.isInteger(days)){
    return Promise.reject(createError(400, 'Invalid universe or days'));
  }
  const query = `SELECT blob3 AS package, blob5 AS platform, SUM(_sample_interval) AS downloads
    FROM r_universe_hits WHERE index1 = '${universe.toLowerCase()}' AND blob2 = 'download'
    AND double1 < 400 AND timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY package, platform FORMAT JSON`;
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${token}`},
    body: query,
    signal: AbortSignal.timeout(30000)
  }).then(function(res){
    if(!res.ok){
      return res.text().then(function(body){
        throw createError(502, `Failed to query download stats (HTTP ${res.status}): ${body}`);
      });
    }
    return res.json().then(x => x.data.map(row => ({...row, downloads: Number(row.downloads)})));
  });
}
