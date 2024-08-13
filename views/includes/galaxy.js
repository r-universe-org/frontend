$(function(){
  $('[data-bs-toggle="tooltip"]').each(function(i){
    var link = $(this);
    var tooltip = bootstrap.Tooltip.getOrCreateInstance(link, {delay:{show:300}});
    link.click(function(e){
      link.blur();
      tooltip.hide();
    })
  });
});
