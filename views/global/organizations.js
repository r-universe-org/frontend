window.onload = function(){
  const msnry = new Masonry('.card-rows');

  // lazy load cards
  const observer = new IntersectionObserver(function(entries){
    for (let entry of entries) {
      if (entry.isIntersecting) {
        var max = entry.target.id == 'scrollbottom2' ? 60 : 30;
        console.log(`Loading ${max} more cards...`)
        document.querySelectorAll(".organization-card.d-none").forEach(function(el, i){
          if(i < max) el.classList.remove('d-none');
        });
        msnry.layout(); /* Workaround for: https://github.com/desandro/masonry/issues/1147 */
      }
    }
  }, {rootMargin: "100px"});
  document.querySelectorAll('.scrollbottom').forEach(el => observer.observe(el));
};

