function update_retry_buttons(){
  //delegated handler: binding to thousands of buttons individually is slow for large universes
  $(document).on('click', '.retry-button', function(e){
    const link = $(this);
    e.preventDefault();
    var win = window.open("", '_blank');
    win.document.write(`Retrying failed builds for ${link.attr("data-pkgver")}. Please wait...`);
    win.document.close();
    fetch(link.attr("data-retry-url"), {
      method: "PATCH"
    }).then(function(res){
      if(res.ok){
        win.location.href = link.attr("href");
      } else {
        return res.text().then((err) => {
          throw new Error(`HTTP ${res.status}: ${err}`);
        });
      }
    }).catch(err => win.document.body.textContent = "ERROR: " + err);
  });
}

function enable_default_tooltips(){
  //lazily create tooltips on hover, instead of instantiating thousands of them on page load
  const selector = '[data-bs-toggle="tooltip"]';
  new bootstrap.Tooltip(document.body, {selector: selector, delay: {show:300}});
  $(document).on('click', selector, function(){
    this.blur();
    bootstrap.Tooltip.getInstance(this)?.hide();
  });
}

$(function(){
  update_retry_buttons();
  enable_default_tooltips();
});
