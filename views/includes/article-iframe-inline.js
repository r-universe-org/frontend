const innerframe = document.getElementById('viewerframe');
innerframe.onload=function(){
  document.getElementById('article-placeholder').remove();
  var doctitle = innerframe.contentDocument.title && innerframe.contentDocument.title.replaceAll(/<\S+?>/g, "");
  if(doctitle){
    document.title = doctitle
    document.getElementById('article-title').innerText = doctitle;
  }
}
