const innerframe = document.getElementById('viewerframe');

innerframe.onload=function(){
  document.getElementById('article-placeholder').remove();
  insert_iframe_resizer();
  hide_frontmatter();
}

function insert_script(src){
  const node = document.createElement("script");
  node.setAttribute('src', src);
  innerframe.contentDocument.body.appendChild(node);
  console.log("inserting", node);
}

//fallback for articles that do not have article.js
//article.js depends on jQuery for now so we just inject iframeResizer
function insert_iframe_resizer(){
  const has_script = innerframe.contentDocument.querySelectorAll('script[src*="r-universe.dev/static/article.js"]').length;
  if(!has_script && innerframe.contentDocument.body){
    insert_script('https://cdnjs.cloudflare.com/ajax/libs/iframe-resizer/4.3.1/iframeResizer.contentWindow.min.js');
    innerframe.contentDocument.body.style.marginBottom = '50px'
  }
}

function hide_frontmatter(){
  const frontmatter = innerframe.contentDocument.getElementsByClassName("frontmatter");
  if(frontmatter.length){
    frontmatter[0].style.display = 'none';
  }
}

