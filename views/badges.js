function update_markdown_links(){
  //delegated handlers: creating thousands of tooltips on page load is slow for large universes
  const selector = '.markdown-copy-link';
  new bootstrap.Tooltip(document.body, {selector: selector});
  $(document).on('click', selector, function(e){
    e.preventDefault();
    this.blur(); //otherwise focus keeps the 'Copied!' tooltip open after the mouse leaves
    var name = this.dataset.name;
    var badge_url = this.dataset.badge;
    var link_url = this.dataset.link;
    const text = `[![${name} status badge](${badge_url})](${link_url})`;
    const tooltip = bootstrap.Tooltip.getOrCreateInstance(this);
    navigator.clipboard.writeText(text).then(function(){
      tooltip.setContent({'.tooltip-inner': 'Copied!'});
      tooltip.show();
    });
  });
  //restore the default title for the next hover
  $(document).on('hidden.bs.tooltip', selector, function(){
    bootstrap.Tooltip.getInstance(this)?.setContent({'.tooltip-inner': 'Copy to clipboard'});
  });
}

$(function(){
  update_markdown_links();
});
