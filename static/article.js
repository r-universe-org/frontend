/* Make width dynamic when loaded within iframe */
if (window.self != window.top) {
  //var container = document.getElementsByClassName('container')[0];
  //if(container) container.className = "container-fluid";

  /* prevent navigating to other sites within iframe */
  $('a').filter(function() {
     return this.hostname && this.hostname !== location.hostname;
  }).attr("target", "_blank");
}


/* Bootstrap styles to tables */
function bootstrapStylePandocTables() {
  $('tr.header').parent('thead').parent('table').addClass('table table-sm');
  $('.litedown-contents table').addClass('table table-sm');
}
$(document).ready(bootstrapStylePandocTables);


/* Some analytics */
function start_plausible(){
  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.type='text/javascript'; g.async=true; g.src='https://plausible.io/js/pa-5P_D7ywpa-XQJ8mVECPL2.js'; s.parentNode.insertBefore(g,s);
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
}
$(document).ready(start_plausible);
