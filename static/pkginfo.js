function update_copy_gist(){
  var link = $('#copy-code-button').unbind("click");
  var tooltip_text = 'Copy to clipboard';
  link.click(function(e){
    var txt = (universe == 'cran') ?
    `install.packages("${package}", repos = "https://cran.r-project.org")` :
    `install.packages("${package}", repos = c("https://${universe}.r-universe.dev", "https://cran.r-project.org"))`;
    navigator.clipboard.writeText(txt).then(function(e){
      link.attr('data-bs-original-title', 'Copied!').tooltip('dispose').tooltip('show');
      link.attr('data-bs-original-title', tooltip_text);
    });
    link.blur();
    return false;
  });
  link.tooltip({title: tooltip_text});
}

$(function(){ 
  update_copy_gist();
});
