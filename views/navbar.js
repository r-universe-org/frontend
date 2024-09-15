(function(){
  var section = location.pathname.split("/")[1];
  var navlink = document.querySelector(`a.nav-link[href="/${section}"]`);
  if(navlink) {
    navlink.classList.add('fw-bold')
  }
})();
