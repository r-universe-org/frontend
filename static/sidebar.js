function a(link, txt){
  return $('<a>').text(txt || link).attr('href', link);
}

function countstr(count){
  return count < 1000 ? count : (count/1000).toFixed(1) + 'k';
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
  return get_url(url).then((res) => res.json());
}

function get_text(url){
  return get_url(url).then((res) => res.text());
}

function get_ndjson(url){
  return get_text(url).then(txt => txt.split('\n').filter(x => x.length).map(JSON.parse));
}

function avatar_url(login, size){
  if(login.startsWith('gitlab-')) login = 'gitlab';
  if(login.startsWith('bitbucket-')) login = 'atlassian';
  login = login.replace('[bot]', '');
  return `https://r-universe.dev/avatars/${login}.png?size=${size}`;
}

function github_api(path){
  return get_json('https://r-universe.dev/gh' + path).catch(function(err){
    console.log("Failed to use GH proxy.")
    return get_json('https://api.github.com' + path);
  });
}

function load_github_user_info(){
  //bioc is the mirror or for bioconductor
  var ghuser = universe == 'bioc' ? 'bioconductor' : universe;
  $("#github-user-avatar").attr('src', avatar_url(ghuser, 248));
  $("#rss-feed").attr("href", server + '/feed.xml');
  /*
  get_text(`https://r-universe.dev/avatars/${ghuser}.keys`).then(function(res){
    if(res.length){
      $("#github-user-keys").toggleClass("d-none").attr('href', `https://github.com/${ghuser}.keys`);
    }
  });
  */
  return github_api('/users/' + ghuser).then(function(user){
    $("#github-user-name").text(user.name || ghuser);

    if(user.name){
      // use same name->title format as GitHub itself
      if(user.type === 'Organization'){
        $("title.default-fallback-title").text(`R packages by ${user.name}`);
      } else {
        $("title.default-fallback-title").text(`R packages by ${ghuser} (${user.name})`);
      }
    }

    $("#github-user-bio").text(user.bio);
    if(user.company){
      $("#github-user-company").toggleClass("d-none").find('.content').text(user.company);
    }
    if(user.location){
      $("#github-user-location").toggleClass("d-none").find('.content').text(user.location);
    }
    if(user.blog){
      var blog = user.blog.startsWith("http") ? user.blog : "https://" + user.blog;
      $("#github-user-blog").toggleClass("d-none").find('.content').append(a(blog));
    }
    if(user.twitter_username){
      $("#github-user-twitter").toggleClass("d-none").attr('href', 'https://twitter.com/' + user.twitter_username);
    }
    if(user.followers){
      $("#github-user-followers").toggleClass("d-none").find('.content').text(countstr(user.followers) + " followers");
    }
    if(user.type == 'User'){
      $("#github-user-avatar").addClass("rounded-circle");
    } else {
      $("#github-user-avatar").removeClass("rounded-circle");
      //$("#github-user-avatar").addClass("p-2");
    }
  }).catch(function(err){
    $("#github-user-bio").text(err);
  });
}

function add_maintainer_icon(maintainer){
  var item = $("#templatezone .maintainer-item").clone();
  item.find('.maintainer-name').text(maintainer.name)
  if(maintainer.login){
    item.attr('href', 'https://' + maintainer.login + '.r-universe.dev');
    item.find('.maintainer-avatar').attr('src', avatar_url(maintainer.login, 140));
  } else {
    item.attr('target', '_blank').attr('href', 'https://github.com/r-universe-org/help#how-to-link-a-maintainer-email-addresses-to-a-username-on-r-universe');
    item.find('.maintainer-avatar').tooltip({title: `<${maintainer.emails}> not associated with any GitHub account.`});
  }
  item.appendTo('#maintainer-list');
}

function load_maintainer_list(){
  get_ndjson(server + '/stats/maintainers?all=true').then(function(x){
    function order( a, b ) {
      if(a.count < b.count) return 1;
      if(a.count > b.count) return -1;
      return 0;
    }
    x.sort(order).slice(0,25).forEach(function(maintainer){
      if(maintainer.login == universe && maintainer.orcid){
        $("#github-user-orcid").toggleClass("d-none").attr('href', 'https://orcid.org/' + maintainer.orcid);
      }
      if(maintainer.login == universe && maintainer.mastodon){
        $("#github-user-mastodon").toggleClass("d-none").attr('href', maintainer.mastodon);
      }
      if(maintainer.login == universe && maintainer.emails && maintainer.emails.length){
        $("#github-user-emails").toggleClass("d-none").find(".content").append(maintainer.emails.join("<br/>"));
        $("#github-user-emails").tooltip({title: `Maintainer email address from package descriptions`});
      }
      if(maintainer.login == universe && maintainer.orgs){
        maintainer.orgs.filter(org => org != universe).forEach(org => add_maintainer_icon({login: org, name: org}));
      }
      if(maintainer.login != universe && maintainer.login != 'test'){
        add_maintainer_icon(maintainer);
      };
    });
    $(".maintainer-list-panel").toggle($('#maintainer-list').children().length > 0);
  });
}

function load_registry_status(){
  const tooltip_success = "Universe registry is up to date";
  const tooltip_failure = "There was a problem updating the registry. Please inspect the log files.";
  const apipath = '/repos/r-universe/' + universe + '/actions/workflows/sync.yml/runs?per_page=1&status=completed';
  $("#registry-status-link").attr("href", 'https://github.com/r-universe/' + universe + '/actions/workflows/sync.yml');
  return github_api(apipath).then(function(data){
    const success = data.workflow_runs[0].conclusion == 'success';
    if(data && data.workflow_runs && data.workflow_runs.length) {
      $("#registry-status-icon")
      .addClass(success ? 'fa-check' : 'fa-exclamation-triangle')
      .addClass(success ? 'text-success' : 'text-danger')
      .tooltip({title: success ? tooltip_success : tooltip_failure});
      $("#github-user-universe").append(a('https://github.com/r-universe/' + universe, "r-universe/" + universe));
    } else {
      throw "Failed to get workflow data";
    }
  }).catch(function(err){
    $("#github-user-universe").append("No personal registry");
    $("#github-user-universe-row").addClass("text-secondary");
    //$("#registry-status-icon").addClass('fa-times').addClass('text-danger');
    console.log(err);
  }).finally(function(e){
    $("#registry-status-spinner").hide();
  });
}

function load_universe_stats(){
  return get_json(`${server}/stats/summary?all=true`).then(function(stats){
    $("#github-user-packages .content").text(stats.packages + ' packages');
    $("#github-user-articles .content").text(stats.articles + ' articles');
    $("#github-user-datasets .content").text(stats.datasets + ' datasets');
    $("#github-user-contributors .content").text(stats.contributors + ' contributors');
  })
}


Date.prototype.getWeek = function() {
  var date = new Date(this.getTime());
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  // January 4 is always in week 1.
  var week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
                        - 3 + (week1.getDay() + 6) % 7) / 7);
}

Date.prototype.getWeekYear = function() {
  var date = new Date(this.getTime());
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  return date.getFullYear();
}

Date.prototype.yyyymm = function(){
  const wk = this.getWeek();
  return this.getWeekYear() + '-' + (wk < 10 ? '0' + wk : wk);
}

function activity_data(updates){
  const now = new Date();
  const weeks = Array(53).fill(0).map((_, i) => new Date(now - i*604800000)).reverse();
  return weeks.map(function(date){
    var out = {date: date};
    var rec = updates.find(x => x.week == `${date.yyyymm()}`);
    if(rec){
      out.total = rec.total;
      if(rec.packages){
        out.packages = Object.keys(rec.packages);
      }
    }
    return out;
  });
}

function update_searchbox(){
  $("#searchform").on('submit', function(e){
    e.preventDefault();
    var query = $("#searchform input").val().trim();
    if(query){
      window.location = `https://r-universe.dev/search/?q=${encodeURIComponent(query)}`;
    }
  });
  $("#searchform input").on('focus', function(e){
    if(!$(this).val()){
      $(this).val(`universe:${universe} `);
    }
  })
}

/* Init global stuff */
$(function(){
  var isprod = location.hostname.endsWith("r-universe.dev");
  window.server = isprod ? "" : 'https://' + universe + '.r-universe.dev';
  $(".nocran").toggle(universe != 'cran');
  load_registry_status();
  load_universe_stats();
  load_maintainer_list();
  load_github_user_info();
  update_searchbox();
});
