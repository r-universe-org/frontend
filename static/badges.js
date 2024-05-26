function update_markdown_links(){
  const tooltip_text = 'Copy to clipboard';
  $('.markdown-copy-link').each(function(){
    $(this).tooltip({title: tooltip_text});
  })
  $('.markdown-copy-link').click(function(e){
    e.preventDefault();
    var md_icon = $(this);
    var name = this.dataset.name;
    var badge_url = this.dataset.badge;
    var link_url = this.dataset.link;
    const text = `[![${name} status badge](${badge_url})](${link_url})`;
    navigator.clipboard.writeText(text).then(function(e){
      md_icon.attr('data-bs-original-title', 'Copied!').tooltip('dispose').tooltip('show');
      md_icon.attr('data-bs-original-title', tooltip_text);
    });
  });
}

$(function(){
  update_markdown_links();
});
