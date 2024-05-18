const color_ok = '#22863a';
const color_bad = '#cb2431';
const color_meh = 'slategrey';

function update_copy_gist(){
  var link = $('#copy-code-button').unbind("click");
  var tooltip_text = 'Copy to clipboard';
  link.click(function(e){
    var txt = (universe == 'cran') ?
    `install.packages("${package}", repos = "https://cloud.r-project.org")` :
    `install.packages("${package}", repos = c("https://${universe}.r-universe.dev", "https://cloud.r-project.org"))`;
    navigator.clipboard.writeText(txt).then(function(e){
      link.attr('data-bs-original-title', 'Copied!').tooltip('dispose').tooltip('show');
      link.attr('data-bs-original-title', tooltip_text);
    });
    link.blur();
    return false;
  });
  link.tooltip({title: tooltip_text});
}

function github_repo_info(repo){
  return github_api('/repos/' + repo).then(function(data){
    if(data.archived){
      $('.open-issues-count').text(`ARCHIVED on GitHub`)
    } else if(data.open_issues_count !== undefined){
      $('.open-issues-count').text(`${data.open_issues_count} issues`)
    }
  });
}

function update_open_issues(src, details){
  if(bugtracker){
    const ghrepo = bugtracker.match('github.com/([^/]+/[^/]+)');
    if(ghrepo){
      github_repo_info(ghrepo[1]);
    }
  }
}

function compare_url(giturl, cran){
  if(giturl.includes("r-forge")) {
    return true; //don't validate git-svn r-forge urls
  }
  var str = giturl.trim().toLowerCase().replace("https://", "");
  return cran.join().toLowerCase().includes(str);
}

function update_cran_status(){
  if(universe == 'cran' || universe == 'bioc') return;
  get_json(`${server}/shared/cranstatus/${package}`).then(function(craninfo){
    if(craninfo.version){
      var versiontxt = craninfo.version === 'archived' ? `${package} (archived)` : `${package}-${craninfo.version}`;
      $('.release-version').text(versiontxt).attr('href', `https://cran.r-project.org/package=${package}`);
      if(craninfo.date) {
        $('.release-date').text(`(${craninfo.date.substring(0,10)}) `);
      }
    } else {
      $('.release-title').append(" no");
      return;
    }
    if(craninfo.version === 'archived'){
      var color = color_meh;
      var iconclass = "fa fa-exclamation-circle";
      var tiptext = `Package ${package} was archived on CRAN!`;
    } else if(compare_url(upstream, craninfo.urls || craninfo.url || "")){
      var color = color_ok;
      var iconclass = "fa fa-check";
      var tiptext = "Verified CRAN package!";
    } else {
      var iconclass = "fa fa-question-circle popover-dismiss";
      var color = color_bad;
      if (upstream.match('https://github.com/cran/')){
        var tiptext = `A package '${package}' exists on CRAN but description does not link to any git repository or issue tracker`;
      } else {
        var tiptext = `A package '${package}' exists on CRAN but description does not link to:<br/><u>${upstream}</u>. This could be another source.`;
      }
      var color = color_bad;
    }
    var icon = $("<i>").addClass(iconclass).css('color', color);
    var cranlink = $("<a>").attr("href", "https://cran.r-project.org/package=" + package).
      attr("target", "_blank").css("margin-left", "5px").css("margin-right", "10px").append(icon);
    $('.release-comment').after(cranlink);
    cranlink.tooltip({title: tiptext, html: true});
  }).catch((error) => {
    console.log('Failed to load attach CRAN badge:', error);
  });
}

$(function(){ 
  update_copy_gist();
  update_cran_status();
  update_open_issues();
});
