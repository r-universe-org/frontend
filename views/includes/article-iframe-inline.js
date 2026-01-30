const innerframe = document.getElementById('viewerframe');

innerframe.onload=function(){
  document.getElementById('article-placeholder').remove();
  insert_iframe_resizer();
  hide_frontmatter();
}

function insert_script(src){
  const node = document.createElement("script");
  node.src = src;
  node.async = true;
  innerframe.contentDocument.body.appendChild(node);
  console.log("inserting", node);
}

//fallback for articles that do not have article.js
//article.js depends on jQuery for now so we just inject iframeResizer
function insert_iframe_resizer(){
  //const has_script = innerframe.contentDocument.querySelectorAll('script[src*="r-universe.dev/static/article.js"]').length;
  if(innerframe.contentDocument.body){
    console.log("Trying to enable iframeResizer for article");
    insert_script('https://cdn.jsdelivr.net/npm/@iframe-resizer/child@5.5.7');
    innerframe.contentDocument.body.style.marginBottom = '50px'
  }
}

function hide_frontmatter(){
  const frontmatter = innerframe.contentDocument.getElementsByClassName("frontmatter");
  if(frontmatter.length){
    frontmatter[0].style.display = 'none';
  }
}
