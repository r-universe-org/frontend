$(function(){
  const container = document.getElementById('package-card-container');
  const msnry = new Masonry(container, {
    itemSelector: '.package-card-col',
    percentPosition: true
  });

  // Lay out now and again on the next frame, once the browser has reflowed
  // any cards we just (re)attached. The deferred pass is essential when a
  // filter only keeps already-loaded cards: no image 'load' event fires to
  // trigger a follow-up layout, so the synchronous one would use stale heights.
  function relayout(){
    msnry.layout();
    requestAnimationFrame(function(){ msnry.layout(); });
  }

  // Relayout once logos finish loading (they change card heights)
  $('.package-details-logo').on('load', function(){
    msnry.layout();
  });

  // Snapshot every card as a lightweight record we can filter/sort without touching the DOM.
  const cards = Array.from(container.querySelectorAll('.package-card-col')).map(function(el){
    return {
      el: el,
      search: el.getAttribute('data-search') || '',
      name: el.getAttribute('data-package') || '',
      score: parseFloat(el.getAttribute('data-score')) || 0,
      stars: parseFloat(el.getAttribute('data-stars')) || 0,
      dependents: parseFloat(el.getAttribute('data-dependents')) || 0,
      scripts: parseFloat(el.getAttribute('data-scripts')) || 0,
      downloads: parseFloat(el.getAttribute('data-downloads')) || 0,
      updated: parseFloat(el.getAttribute('data-updated')) || 0
    };
  });

  const CHUNK = 30;
  const sorters = {
    score:      (a, b) => b.score - a.score,
    stars:      (a, b) => b.stars - a.stars,
    dependents: (a, b) => b.dependents - a.dependents,
    scripts:    (a, b) => b.scripts - a.scripts,
    downloads:  (a, b) => b.downloads - a.downloads,
    updated:    (a, b) => b.updated - a.updated,
    name:       (a, b) => a.name.localeCompare(b.name)
  };

  const state = {filter: '', sort: 'score'};
  let ordered = [];   // current filtered + sorted list
  let rendered = 0;   // how many of `ordered` are currently in the DOM

  // Initialize Fuse.js for fuzzy search
  const fuse = new Fuse(cards, {
    keys: ['search', 'name'],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true
  });

  const filterEl = document.getElementById('package-filter');
  const countEl = document.getElementById('filter-count');
  const noResultsEl = document.getElementById('filter-noresults');
  const noResultsTermEl = document.getElementById('filter-noresults-term');

  function compute(){
    const term = state.filter.trim().toLowerCase();
    let list = cards;
    if(term){
      list = fuse.search(term).map(result => result.item);
    }
    return list.slice().sort(sorters[state.sort] || sorters.score);
  }

  function appendSlice(from, to){
    const slice = ordered.slice(from, to);
    if(!slice.length) return [];
    const frag = document.createDocumentFragment();
    slice.forEach(c => frag.appendChild(c.el));
    container.appendChild(frag);
    return slice.map(c => c.el);
  }

  function updateStatus(){
    const total = cards.length;
    const shown = ordered.length;
    if(state.filter.trim()){
      countEl.textContent = shown === 1 ?
        '1 matching package' : (shown + ' of ' + total + ' packages');
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

  // Full re-render: used when the filter or sort changes.
  function render(){
    ordered = compute();
    cards.forEach(c => { if(c.el.parentNode === container) container.removeChild(c.el); });
    appendSlice(0, CHUNK);
    rendered = Math.min(CHUNK, ordered.length);
    msnry.reloadItems();
    relayout();
    if(typeof window.show_timestamps === 'function') window.show_timestamps();
    updateStatus();
  }

  // Incremental: append the next chunk on scroll.
  function loadMore(){
    if(rendered >= ordered.length) return;
    const els = appendSlice(rendered, rendered + CHUNK);
    rendered = Math.min(rendered + CHUNK, ordered.length);
    msnry.appended(els);
    relayout();
    if(typeof window.show_timestamps === 'function') window.show_timestamps();
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
  document.querySelectorAll('#package-toolbar [data-sort]').forEach(function(item){
    item.addEventListener('click', function(){
      state.sort = item.getAttribute('data-sort');
      document.querySelectorAll('#package-toolbar [data-sort]').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('sort-label').textContent = ' ' + item.getAttribute('data-label');
      render();
    });
  });

  // --- Lazy load more on scroll ---
  const sentinel = document.getElementById('scrollbottom');
  if(sentinel){
    const observer = new IntersectionObserver(function(entries){
      if(entries.some(e => e.isIntersecting)) loadMore();
    }, {rootMargin: '400px'});
    observer.observe(sentinel);
  }

  render();
});
