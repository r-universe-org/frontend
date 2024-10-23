var _paq = window._paq = window._paq || [];
var site_id = location.hostname == 'docs.r-universe.dev' ? '4' : '2';
console.log(`Matomo site ID for ${location.hostname}: ${site_id}`);
_paq.push(["setDocumentTitle", document.domain + "/" + document.title]);
_paq.push(["setCookieDomain", "*.r-universe.dev"]);
_paq.push(["setDomains", ["*.r-universe.dev"]]);
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
(function() {
  var u="https://ropensci.matomo.cloud/";
  _paq.push(['setTrackerUrl', u+'matomo.php']);
  _paq.push(['setSiteId', site_id]);
  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.type='text/javascript'; g.async=true; g.src='//cdn.matomo.cloud/ropensci.matomo.cloud/matomo.js'; s.parentNode.insertBefore(g,s);
})();
