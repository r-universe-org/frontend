$(function(){
  const list = document.getElementById('dataset-list');
  if(!list) return;

  // Snapshot each dataset row so we can filter without re-reading the DOM.
  const items = Array.from(list.querySelectorAll('.dataset-item')).map(function(el){
    return {
      el: el,
      name: el.getAttribute('data-name') || '',
      title: el.getAttribute('data-title') || '',
      klass: el.getAttribute('data-class') || ''
    };
  });

  // Fuzzy search across name (package::dataset), title and class.
  const fuse = new Fuse(items, {
    ignoreLocation: true,
    threshold: 0.2,
    shouldSort: true,
    keys: [
      {name: 'name',  weight: 0.55},
      {name: 'title', weight: 0.30},
      {name: 'klass', weight: 0.15}
    ]
  });

  const state = {filter: ''};

  const filterEl = document.getElementById('dataset-filter');
  const countEl = document.getElementById('dataset-count');
  const noResultsEl = document.getElementById('dataset-noresults');
  const noResultsTermEl = document.getElementById('dataset-noresults-term');

  function compute(){
    const term = state.filter.trim();
    // While searching, order by Fuse relevance. With no term, keep the
    // original (package-sorted) order the page was rendered in.
    if(term){
      return fuse.search(term).map(r => r.item);
    }
    return items.slice();
  }

  function render(){
    const ordered = compute();
    items.forEach(it => { if(it.el.parentNode === list) list.removeChild(it.el); });
    const frag = document.createDocumentFragment();
    ordered.forEach(it => frag.appendChild(it.el));
    list.appendChild(frag);

    const total = items.length;
    const shown = ordered.length;
    if(state.filter.trim()){
      countEl.textContent = shown === 1 ?
        '1 matching dataset' : (shown + ' of ' + total + ' datasets');
      countEl.classList.remove('d-none');
    } else {
      countEl.classList.add('d-none');
    }
    if(shown === 0){
      noResultsTermEl.textContent = ' “' + state.filter.trim() + '”';
      noResultsEl.classList.remove('d-none');
    } else {
      noResultsEl.classList.add('d-none');
    }
  }

  // --- Filter input (debounced) ---
  let debounce;
  filterEl.addEventListener('input', function(){
    clearTimeout(debounce);
    debounce = setTimeout(function(){
      state.filter = filterEl.value;
      render();
    }, 150);
  });
  filterEl.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      filterEl.value = '';
      state.filter = '';
      render();
    }
  });

  render();
});
