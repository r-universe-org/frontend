const innerframe = document.getElementById('viewerframe');
innerframe.onload=function(){
  document.getElementById('article-placeholder').remove();
  var doc = innerframe.contentDocument;
  var doctitle = doc && doc.title && doc.title.replaceAll(/<\S+?>/g, "");
  if(doctitle){
    document.title = doctitle
    document.getElementById('article-title').innerText = doctitle;
  }
}
