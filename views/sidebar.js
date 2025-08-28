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

function github_api(path){
  return get_json('https://r-universe.dev/gh' + path).catch(function(err){
    console.log("Failed to use GH proxy.")
    return get_json('https://api.github.com' + path);
  });
}

function load_github_user_info(){
  var ghuser = universe;
  if(universe === 'bioc'){
    //bioc is the mirror or for bioconductor
    ghuser = 'bioconductor';
  }
  if(universe === 'r-multiverse-staging'){
    ghuser = 'r-multiverse';
  }
  if(universe === 'ropensci-champions'){
    ghuser = 'ropensci';
  }
  $(".navbar img").attr('src', $(".navbar img").attr('src').replace(`/${universe}.png`, `/${ghuser}.png`));
  $("#github-user-avatar").attr('src', $("#github-user-avatar").attr('src').replace(`/${universe}.png`, `/${ghuser}.png`));
  //$("#github-user-avatar").attr('src', avatar_url(ghuser, 248));
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
    if(user.type === 'User'){
      $("#github-user-github").removeClass("d-none").attr('href', `https://github.com/${ghuser}`);
    }
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
    if(user.followers){
      $("#github-user-followers").toggleClass("d-none").find('.content').text(countstr(user.followers) + " followers");
    }
    $("#github-user-avatar").toggleClass("rounded-circle", user.type == 'User');
  }).catch(function(err){
    $("#github-user-bio").text(err);
  });
}

function add_maintainer_icon(maintainer){
  var item = $("#templatezone .maintainer-item").clone();
  item.find('.maintainer-name').text(maintainer.name)
  if(maintainer.login){
    item.attr('href', 'https://' + maintainer.login + '.r-universe.dev');
    item.find('.maintainer-avatar').attr('src', avatar_url(maintainer.uuid || maintainer.login, 140));
  } else {
    item.attr('target', '_blank').attr('href', 'https://docs.r-universe.dev/publish/metadata.html#how-to-link-a-maintainer-email-addresses-to-a-username-on-r-universe');
    item.find('.maintainer-avatar').tooltip({title: `<${maintainer.emails}> not associated with any GitHub account.`});
  }
  item.appendTo('#maintainer-list');
}

function load_maintainer_list(){
  get_ndjson(server + '/stats/maintainers?limit=25&all=true').then(function(x){
    x.forEach(function(maintainer){
      if(maintainer.login == universe && maintainer.orcid){
        $("#github-user-orcid").removeClass("d-none").attr('href', 'https://orcid.org/' + maintainer.orcid);
      }
      if(maintainer.login == universe && maintainer.linkedin){
        $("#github-user-linkedin").removeClass("d-none").attr('href', maintainer.linkedin.replace(/^in/, "https://www.linkedin.com/in"));
      }
      if(maintainer.login == universe && maintainer.mastodon){
        var match = maintainer.mastodon.match(/^(@.*)@(.*)$/);
        if(match){
          maintainer.mastodon = `https://${match[2]}/${match[1]}`
        }
        $("#github-user-mastodon").removeClass("d-none").attr('href', maintainer.mastodon);
      }
      if(maintainer.login == universe && maintainer.bluesky){
        var bskylink = maintainer.bluesky.replace(/^@/, 'https://bsky.app/profile/');
        $("#github-user-bluesky").removeClass("d-none").attr('href', bskylink);
      }
      if(maintainer.login == universe && maintainer.emails && maintainer.emails.length){
        $("#github-user-emails").removeClass("d-none").find(".content").append(maintainer.emails.join("<br/>"));
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
  const tooltip_failure = "There was a problem updating the registry. Click to inspect the log files.";
  const apipath = '/repos/r-universe/' + universe + '/actions/workflows/sync.yml/runs?per_page=1&status=completed';
  $("#registry-status-link").attr("href", 'https://github.com/r-universe/' + universe + '/actions/workflows/sync.yml');
  return github_api(apipath).then(function(data){
    if(data && data.workflow_runs && data.workflow_runs.length) {
      const last_job = data.workflow_runs[0];
      const success = last_job.conclusion == 'success';
      $("#registry-status-icon")
        .addClass(success ? 'fa-check' : 'fa-exclamation-triangle')
        .addClass(success ? 'text-success' : 'text-danger')
        .tooltip({title: success ? tooltip_success : tooltip_failure});
      $("#github-user-universe").append(a('https://github.com/r-universe/' + universe, "r-universe/" + universe));
      if(!success){
        $("#registry-status-link").attr("href", last_job.html_url);
      }
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
    for (const [key, value] of Object.entries(stats)) {
      $(`#github-user-${key} .content`).text(`${value || 0} ${key}`);
      if(!value){
        $('a[href="/' + key + '"]').addClass("disabled").removeClass("text-dark").addClass("text-secondary");
      }
    }
  });
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

function pretty_time_diff(ts){
  var date = new Date(ts);
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

function show_timestamps(){
  $(".package-show-difftime[data-timestamp]").each(function() {
    $(this).text(pretty_time_diff(this.dataset.timestamp));
  });
}

/* Load sidebar and globals */
$(function(){
  var isdev = window.location.hostname == 'localhost';
  window.server = isdev ? 'https://' + universe + '.r-universe.dev' : "";
  $(".nocran").toggle(universe != 'cran');
  show_timestamps();
  load_registry_status();
  load_universe_stats();
  load_maintainer_list();
  load_github_user_info();
  update_searchbox();
});
