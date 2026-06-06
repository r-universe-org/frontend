$(function(){
  const list = document.getElementById('article-list');
  if(!list) return;

  // Snapshot each article row so we can filter/sort without re-reading the DOM.
  const items = Array.from(list.querySelectorAll('.article-item')).map(function(el){
    return {
      el: el,
      title: el.getAttribute('data-title') || '',
      author: el.getAttribute('data-author') || '',
      pkg: el.getAttribute('data-package') || '',
      modified: parseFloat(el.getAttribute('data-modified')) || 0
    };
  });

  // Fuzzy search across title, package and author (title weighted highest).
  const fuse = new Fuse(items, {
    ignoreLocation: true,
    threshold: 0.4,
    keys: [
      {name: 'title',  weight: 0.50},
      {name: 'pkg',    weight: 0.30},
      {name: 'author', weight: 0.20}
    ]
  });

  const sorters = {
    updated: (a, b) => b.modified - a.modified,
    title:   (a, b) => a.title.localeCompare(b.title),
    package: (a, b) => a.pkg.localeCompare(b.pkg)
  };

  const state = {filter: '', sort: 'updated'};

  const filterEl = document.getElementById('article-filter');
  const countEl = document.getElementById('article-count');
  const noResultsEl = document.getElementById('article-noresults');
  const noResultsTermEl = document.getElementById('article-noresults-term');

  function compute(){
    const term = state.filter.trim();
    // While searching, keep Fuse's relevance ranking (best match first).
    // With no search term, order by the field chosen in the sort dropdown.
    if(term){
      return fuse.search(term).map(r => r.item);
    }
    return items.slice().sort(sorters[state.sort] || sorters.updated);
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
      const label = shown === 1 ? '1 matching article' : (shown + ' of ' + total + ' articles');
      countEl.textContent = shown > 0 ? label + ' · sorted by best match' : label;
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

  // --- Sort dropdown ---
  document.querySelectorAll('#article-toolbar [data-sort]').forEach(function(item){
    item.addEventListener('click', function(){
      state.sort = item.getAttribute('data-sort');
      document.querySelectorAll('#article-toolbar [data-sort]').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('article-sort-label').textContent = ' ' + item.getAttribute('data-label');
      // Choosing a sort field is a browse action: clear any active search so
      // the chosen ordering takes effect (search forces relevance order).
      if(filterEl.value){
        filterEl.value = '';
        state.filter = '';
      }
      render();
    });
  });

  render();
});
