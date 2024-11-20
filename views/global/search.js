const exampletopics = ['maps', 'bayesian', 'ecology', 'climate', 'genome', 'gam',
  'spatial', 'database', 'pdf', 'shiny', 'rstudio', 'machine learning', 'prediction',
  'birds', 'fish', 'sports']

const searchfields = {
  'package' : 'exact package name',
  'owner' : 'github user/organization of the package repository',
  'contributor' : 'contributor (github username)',
  'author' : 'author name (free text)',
  'maintainer' : 'maintainer name (free text)',
  'topic' : 'keyword/topic label',
  'needs' : 'packages that transitively depend on this package',
  'exports' : 'name of a function or object in the package',
  'data' : 'match keyword in title of a dataset dataset '
}

function get_url(url){
  return fetch(url).then((res) => {
    if (res.ok) {
      return res;
    }
    throw new Error(`HTTP ${res.status} for: ${url}`);
  });
}

function get_json(url){
  return fetch(url).then(res => {
    if(res.ok){
      return res.json();
    } else {
      return res.text().then(function(txt){
        throw new Error(txt);
      });
    }
  });
}

function get_text(url){
  return get_url(url).then((res) => res.text());
}

function get_ndjson(url){
  return get_text(url).then(txt => txt.split('\n').filter(x => x.length).map(JSON.parse));
}


function restore_from_query(e){
  search_for(decodeURIComponent(get_query()))
}

function build_search_fields(){
  var searchdiv = $("#extra-search-fields");
  for (const field in searchfields) {
    var item = $("#templatezone .search-field-item").clone();
    var idname = `search-item-${field}`;
    item.find("label").attr("for", idname).text(field)
    item.find("input").attr("id", idname).attr("data-field", field).attr("placeholder", searchfields[field]).change(function(){
      var fieldname = $(this).attr("data-field");
      var fieldvalue = $(this).val().trim().replace(/\s+/g, '+');
      var query =  fieldvalue ? `${fieldname}:${fieldvalue}` : "";
      var re = new RegExp(`${fieldname}:(\\S+)`, "i");
      var oldquery = $('#search-input').val();
      if(oldquery.match(re)){
        newquery = oldquery.replace(re, query);
      } else {
        newquery = `${oldquery} ${query}`;
      }
      $('#search-input').val(newquery.trim());
      do_search();
    }).keypress(function(e){
      if(e.keyCode === 13){
        //close panel on enter key
        searchdiv.collapse('hide');
      }
    });
    item.appendTo(searchdiv);
    searchdiv.on('shown.bs.collapse', function(){
      populate_search_fields();
    });
  }
  var closelink = $("<a>").attr("href", "#").text("close").addClass("float-end").click(function(e){
    e.preventDefault();
    searchdiv.collapse('hide');
  });
  searchdiv.append($("<span>").append(closelink));
}

function populate_search_fields(){
  if(!$("#extra-search-fields").hasClass('show')) return;
  $(".search-item-input").val("");
  var re = new RegExp(`(\\S+):(\\S+)`, "ig");
  var matches = $('#search-input').val().match(re);
  if(!matches) return;
  matches.forEach(function(item){
    var out = item.split(":");
    if(out.length == 2){
      var field = out[0].toLowerCase();
      $(`#search-item-${field}`).val(out[1].replace(/[+]/g, ' '));
    }
  });
}

function a(link, txt){
  return $('<a>').text(txt || link).attr('href', link);
}

function pretty_time_diff(ts){
  var date = new Date(ts*1000);
  var now = new Date();
  var diff_time = now.getTime() - date.getTime();
  var diff_hours = Math.round(diff_time / (1000 * 3600));
  var diff_days = Math.round(diff_hours / 24);
  if(diff_hours < 24){
    return diff_hours + " hours ago"
  } else if(diff_days < 31){
    return diff_days + " days ago";
  } else if (diff_days < 365){
    return Math.round(diff_days / 30) + " months ago";
  } else {
    return Math.round(diff_days / 365) + " years ago";
  }
}

function make_pkg_card(pkg, i){
  var user = pkg['_user'];
  var item = $("#templatezone .package-description-item").clone();
  var maintainer = pkg.maintainer || {};
  item.find('.img').attr('src', avatar_url(pkg._uuid || user, 120)).on('load', () => msnry.layout());
  item.find('.package-org').text(user);
  item.find('.package-link').attr('href', `https://${user}.r-universe.dev/${pkg.Package}`);
  item.find('.package-name').text(pkg.Package);
  item.find('.package-title').text(pkg.Title);
  item.find('.description-maintainer').text(`Maintained by ${maintainer.name}. `);
  item.find('.package-description').text(pkg.Description.replace('\n', ' '));
  if(pkg.updated){
    item.find('.description-last-updated').text(`Last updated ${pretty_time_diff(pkg.updated)}.`);
  }
  if(pkg.stars){
    item.find('.description-stars').removeClass('d-none').append(` ${pkg.stars} stars`);
  }
  if(pkg._searchresults){
    item.find('.description-scripts').removeClass('d-none').append(` ${pkg._searchresults} scripts`);
  }
  if(pkg._usedby){
    item.find('.description-dependents').removeClass('d-none').append(` ${pkg._usedby} dependents`);
  }
  item.find('.description-pkgscore').removeClass('d-none').append(` ${pkg._score.toFixed(2)} score`);
  if(pkg.match){
    item.find('.description-score').removeClass('d-none').append(` ${pkg.match.toFixed(1)} match`);
  }
  item.appendTo('#search-results');
  var topics = pkg.topics || [];
  if(topics && topics.length){
    var topicdiv = item.find('.description-topics').removeClass('d-none');
    if(typeof topics === 'string') topics = [topics]; //hack for auto-unbox bug
    topics.forEach(function(topic){
      var quotedtopic = topic.includes("-") ? `"${topic}"` : topic;
      var topicurl = `/search?q=${quotedtopic}`;
      $("<a>").attr("href", topicurl).addClass('badge badge-topic me-1').text(topic).appendTo(topicdiv).click(function(e){
        e.preventDefault();
        search_for(quotedtopic);
      });
    });
  }
}

function populate_search_results(results){
  results.forEach(make_pkg_card);
  $('<div class="col-12 scrollbottom" style="height:500px"></div>').appendTo('#search-results');
  $('<div class="col-12 scrollbottom" style="height:500px"></div>').appendTo('#search-results');
  document.querySelectorAll('.scrollbottom').forEach(el => observer.observe(el));
  msnry.reloadItems();
}

function get_query(){
  const params = new URLSearchParams(window.location.search);
  return params.get('q') || "";
}

function update_results(){
  var q = $("#search-input").val();
  $("title").text(`R-universe search: ${q}`);
  $('#search-results').empty();
  if(q.length < 2){
    $('#search-results-comment').empty();
    $('#results-placeholder').show();
    $('svg').show('fast', () => $('#search-input').focus());
    msnry.layout();
    return;
  }
  $('#results-placeholder').hide();
  $('svg').hide('fast');
  $(window).scrollTop(0);
  get_json('https://r-universe.dev/api/search?limit=200&all=true&q=' + q).then(function(x){
    if(!x.total){
      $('#search-results-comment').text(`No results for "${decodeURIComponent(q)}"`);
    } else {
      $('#search-results-comment').text(`Showing ${x.results.length} of total ${x.total} results\n`);
    }
    var qlink = $('<a mx-1 href="#"><small>(show query)</small></a>').appendTo('#search-results-comment');
    qlink.click(function(e){
      e.preventDefault();
      $(this).hide();
      $('#search-results-comment').append($("<tt>").text(JSON.stringify(x.query)));
    });
    populate_search_results(x.results);
  }).catch(function(err){
    $('#search-results-comment').empty().text(err.message);
  });
};

function do_search(){
  var search = $("#search-input").val();
  var state = history.state || {};
  if(state.search != search){
    history.pushState({search: search}, '', search ? `/search?q=${encodeURIComponent(search)}` : '/search');
    populate_search_fields();
    update_results();
  }
}

function search_for(str){
  $("#search-input").val(str);
  do_search();
}

function append_topic(topic, i){
  var quotedtopic = topic.includes("-") ? `"${topic}"` : encodeURIComponent(topic);
  $("<a>").addClass("text-secondary fw-bold fst-italic").attr("href", '/search?q=' + quotedtopic).text(topic).appendTo('#topics-list');
  $('#topics-list').append(", ");
}

function load_all_topics(){
  $('#topics-list').empty().text("Popular topics: ");
  get_ndjson('https://r-universe.dev/stats/topics?min=3&limit=250').then(function(topicdata){
    topicdata.map(x => x.topic).forEach(append_topic);
  });
  return false;
}

function organization_card(x){
  var item = $("#templatezone .organization-item").clone();
  item.find('.card-img-top').attr('src', avatar_url(x.uuid || x.universe, 224));
  item.find('.card-text').text(x.universe);
  item.find('.card').attr('href', `https://${x.universe}.r-universe.dev`);
  return item;
}

function load_organizations(){
  var pages = 8;
  var pagesize = 12;
  var pinned = ['ropensci', 'bioc', 'tidyverse', 'r-spatial', 'pharmaverse', 'vimc',
              'lcbc-uio', 'rstudio', 'ropengov', 'r-lib', 'stan-dev', 'carpentries'];
  //for maintainers use: 'https://r-universe.dev/stats/maintainers?limit=100'
  get_ndjson('https://r-universe.dev/api/universes?type=organization&skipcran=1&limit=96&stream=1').then(function(data){
    data = data.sort((x,y) => pinned.includes(x.universe) ? -1 : 1);
    for(let i = 0; i < pages; i++) {
      var slide = $("#templatezone .carousel-item").clone();
      var row = slide.find('.maintainer-row');
      for(let j = 0; j < pagesize; j++){
        row.append(organization_card(data[i * pagesize + j]));
      }
      if(i == 0) slide.addClass('active');
      slide.appendTo('.carousel-inner') 
    }
    $(".carousel-control").click(function(){
      $(this).blur();
    })
  });
}

function load_summary_stats(){
  get_json('https://r-universe.dev/stats/summary?all=true').then(function(stats){
    Object.keys(stats).forEach(key => $(`#summary-n-${key}`).text(stats[key]));
  });
}

function load_blog_posts(){
  get_json('https://ropensci.org/r-universe/index.json').then(function(posts){
    posts.items.forEach(function(x){
      var dt = new Date(x.date);
      var datestr =`${dt.toLocaleString('default', { month: 'long' })} ${dt.getDate()}, ${dt.getFullYear()}`;
      var item = $("<li>").appendTo(".blog-posts");
      $("<a>").appendTo(item).attr("href", x.url).text(x.title);
      $("<span>").appendTo(item).addClass("d-none d-lg-inline").text(datestr);
    });
  });
}

function avatar_url(login, size){
  if(size){
    var param = `?size=${size}`;
  }
  if(typeof login === 'number'){
    return `https://avatars.githubusercontent.com/u/${login}${param}`;
  }
  if(login == 'bioc') login = 'bioconductor';
  if(login.startsWith('gitlab-')) login = 'gitlab';
  if(login.startsWith('bitbucket-')) login = 'atlassian';
  login = login.replace('[bot]', '');
  return `https://r-universe.dev/avatars/${login}.png${param}`;
}


function debounce(func, timeout = 300){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

function reveal_cards(max){
  var cards = $("#search-results .package-description-item.d-none").slice(0, max);
  if(cards.length){
    console.log(`Showing ${cards.length} more cards.`);
    cards.removeClass('d-none');
    msnry.layout();
  }
}

function init_observer(){
  const observer = new IntersectionObserver(function(entries){
    for (let entry of entries) {
      if (entry.isIntersecting) {
        reveal_cards(10);
      }
    }
  }, {rootMargin: "100px"});
  window.msnry = new Masonry('#search-results', {transitionDuration: 0.2});
  window.observer = observer;
}

$(function(){
  $('#search-button').click(function(){
    $(this).blur();
    $("#extra-search-fields").collapse('hide');
    do_search();
  });

  addEventListener('popstate', function(e){
    var state = e.state || {};
    $('#search-input').val(state.search);
    populate_search_fields();
    update_results();
  });

  //lazy show search results
  init_observer();

  //first page init
  if(get_query().length){
    restore_from_query()
  } else {
    $('#search-input').focus();
  }

  $('#search-input').on("keydown paste input", debounce(do_search));
  exampletopics.forEach(append_topic);
  const more = $('<a>').attr('href', '#').text("... (more popular topics)").click(load_all_topics);
  $('#topics-list').append(more);
  build_search_fields();
  load_summary_stats();
  load_organizations();
  load_blog_posts();
});
