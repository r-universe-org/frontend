const color_ok = '#22863a';
const color_bad = '#cb2431';
const color_meh = 'slategrey';
const package = pkginfo.package;

function update_copy_gist(){
  var link = $('#copy-code-button').unbind("click");
  var tooltip_text = 'Copy to clipboard';
  link.click(function(e){
    var txt = $("#file-install-r-LC2").text();
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
  var bugtracker = pkginfo.bugtracker;
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
  var upstream = pkginfo.upstream;
  if(universe == 'cran' || universe == 'bioc' || universe == 'bioc-release') return;
  get_json(`https://r-universe.dev/cranstatus/${package}`).then(function(craninfo){
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
        var tiptext = `A package '${package}' exists on CRAN but its description does not link to a known Git server`;
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

function update_conda_status(){
  const lowpkg = package.toLowerCase();
  return get_json(`https://r-universe.dev/condastatus/${lowpkg}`).then(function(conda){
    if(conda.version){
      $('.conda-version').text(`r-${lowpkg}-${conda.version}`).attr('href', conda.url);
      $('.conda-date').text(`(${conda.date.substring(0,10)}) `);
      $('.conda-forge').removeClass('d-none');
    }
  }).catch(() => console.log('Failed to lookup condaforge status'))
}

function show_data_download(x){
  $('#download-data-modal h5').text(x.title);
  $('#download-data-modal .modal-body').empty().text("Loading...")
  $('#download-data-modal').modal('show');
  $('#download-data-modal .export-type').empty().append(`${x.name} is a <b>${x.type}</b>`);
  $('#download-data-modal .export-rda').attr('href', `${server}/${package}/data/${x.name}/rda`);
  $('#download-data-modal .export-rds').attr('href', `${server}/${package}/data/${x.name}/rds`);
  $('#download-data-modal .export-csv').attr('href', `${server}/${package}/data/${x.name}/csv`).toggle(x.table);
  $('#download-data-modal .export-xlsx').attr('href', `${server}/${package}/data/${x.name}/xlsx`).toggle(x.table && x.df);
  $('#download-data-modal .export-ndjson').attr('href', `${server}/${package}/data/${x.name}/ndjson`).toggle(x.df && x.tojson);
  $('#download-data-modal .export-json').attr('href', `${server}/${package}/data/${x.name}/json`).toggle(x.tojson);
  get_text(server + x.help.replace("manual.html#", "page/")).then(function(str){
    var el = $.parseHTML(`<div>${str.replaceAll("main>", "div>")}</div>`);
    $(el).find("hr").remove();
    $(el).find("h2").remove();
    $(el).find("h3").addClass('h5');
    $(el).find("table").addClass('table table-sm table-responsive');
    $('#download-data-modal .modal-body').empty().append(el);
  });
}

function update_dataset_onclick(){
  $(".dataset-download").click(function(e){
    e.preventDefault();
    var dataset = Object.assign({}, this.dataset);
    dataset.tojson = dataset.tojson !== undefined;
    dataset.table = dataset.table !== undefined;
    dataset.df = dataset.df !== undefined;
    show_data_download(dataset);
  });
}

function enable_default_tooltips(){
  $('[data-bs-toggle="tooltip"]').each(function(i){
    var link = $(this);
    var tooltip = bootstrap.Tooltip.getOrCreateInstance(link, {delay:{show:300}});
    link.click(function(e){
      link.blur();
      tooltip.hide();
    })
  });
}

function update_citation_html(){
  if($('#citation').length){
    get_text(`${server}/${package}/citation.html`).then(function(htmlString){
      var htmlDoc = (new DOMParser()).parseFromString(htmlString, "text/html");
      $(htmlDoc).find('.container').removeClass('container').appendTo('.package-citation-content');
    });
  }
}

function replace_headers(doc, from, to){
  doc.find(from).each(function(){
    var old = $(this)
    var replacement = $(document.createElement(to));
    replacement.text(old.text()).append(old.children());
    old.replaceWith(replacement);
  });
}

function update_readme_html(){
  if($('.package-readme-content').length){
    get_text(`${server}/${package}/doc/readme?highlight=hljs`).then(function(res){
      var doc = $(res);
      doc.find("a").attr("target", "_blank").each(function(){
        if($(this).attr('href').startsWith("#")){
          $(this).removeAttr('href');
        }
      });
      replace_headers(doc, "h4", "h6")
      replace_headers(doc, "h3", "h5")
      replace_headers(doc, "h2", "h4")
      replace_headers(doc, "h1", "h3")

      /* Override bootstrap table css to prevent overflowing */
      doc.find("table").addClass("table table-sm").attr('style', 'display: block; overflow:auto; width: 0; min-width: 100%;');
      doc.find('img').addClass('d-none').on("load", function() {
        var img = $(this);
        /* Do not show badges and broken images */
        if(img[0].naturalHeight > 60 || img[0].naturalWidth > 300) {
          var islogo = img.attr('src').includes('logo');
          img.addClass('p-2').css('max-height', islogo ? '200px' : '400px').css('width', 'auto').css('max-width', '90%').removeClass('d-none');
        } else {
          img.remove();
        }
      });
      $('.package-readme-content').html(doc);
    });
  }
}

function update_package_revdeps(){
  var revdepdiv = $(".package-details-revdeps");
  return get_json(`https://r-universe.dev/api/revdeps/${package}`).then(function(revdeps){
    function make_link(pkg, owner){
      return $("<a>").text(pkg).addClass('text-dark').attr('href', `https://${owner}.r-universe.dev/${pkg}`);
    }
    function add_one_user(){
      if(!revdeps.length) return;
      var x = revdeps.shift();
      var item = $("#templatezone .revdep-item").clone().appendTo(revdepdiv);
      item.find('.revdep-user-link').attr('href', 'https://' + x.owner + '.r-universe.dev');
      item.find('.revdep-user-avatar').attr('src', avatar_url(x.owner, 120));
      var packages = item.find('.revdep-user-packages');
      x.packages.sort((a,b) => a.stars > b.stars ? -1 : 1).forEach(function(pkg){
        packages.append(make_link(pkg.package, x.owner)).append(" ");
      });
    }
    var totalusers = revdeps.length;
    if(totalusers){
      for(var i = 0; i < 20; i++) add_one_user();
      if(revdeps.length){
        var morelink = $(`<button class="btn btn-sm btn-outline-primary m-2"><i class="fas fa-sync"></i> Show all ${totalusers} users</button>`).click(function(e){
          $(this).remove()
          e.preventDefault();
          while(revdeps.length) add_one_user();
        }).appendTo(revdepdiv);
      }
    } else {
      revdepdiv.append($("<p>").addClass("m-1").text(`No packages in r-universe depend on '${package}'.`))
    }
  });
}

function lazy_update_package_revdeps(){
  var done = 0;
  var options = {rootMargin: "1000px"};
  const observer = new IntersectionObserver(function(entries){
    for (let entry of entries) {
      if (entry.target.id == 'users' && entry.isIntersecting && !done) {
        done = 1;
        observer.disconnect()
        update_package_revdeps();
      }
    }
  }, options);
  var element = document.querySelector('#users');
  observer.observe(element);
}

function release_annotations(tags, activity_data){
  return tags.sort((a, b) => (a.date > b.date) ? 1 : -1).map(function(x, i){
    var date = new Date(x.date);
    var week = date.getWeek();
    var year = date.getWeekYear();
    var matchdate = activity_data.find(x => x.date.getWeek() == week && x.date.getWeekYear() == year);
    //var latest = (i == tags.length-1);
    var color = 'black';
    return {
      type: 'line',
      xMin: matchdate ? matchdate.date : date,
      xMax: matchdate ? matchdate.date : date,
      borderColor: color,
      borderDash: [3, 3],
      label: {
        display: true,
        content: `v${x.version.replace(/^v/, '')}`,
        position: 'end',
        yAdjust: -5
      }
    }
  });
}

function update_commit_chart(){
  if($('#package-updates-canvas').length == 0) return;//skip for cran-universe
  const ctx = $('#package-updates-canvas').empty().attr('height', '300').height(300);
  const data = activity_data(pkginfo.updates.map(x => ({total:x.n, week:x.week})));
  const tags = release_annotations(pkginfo.releases || [], data);
  const myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(x => x.date),
      datasets: [{
        label: 'updates',
        data: data.map(x => x.total),
        backgroundColor: 'rgb(54, 162, 235, 0.2)',
        borderColor: 'rgb(54, 162, 235, 1)',
        borderWidth: 2
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins : {
        legend: false,
        title: {
          display: false,
        },
        tooltip: {
          animation: false,
          callbacks: {
            title: function(items){
              return `Week ${data[items[0].dataIndex].date.getWeek()}`
            }
          }
        },
        annotation: {
          annotations: tags
        }
      },
      layout: {
        padding: 20
      },
      scales: {
        x: {
            type: 'time',
            time: {
                unit: 'month'
            }
        },
        y : {
          title: {
            display: true,
            text: 'Weekly updates'
          }
        }
      }
    }
  });
}

function update_contributor_tooltips(){
  $(".package-contributor-img").each(function(){
    var data = this.dataset;
    $(this).tooltip({title: `${data.login} made ${data.count} contributions to ${package}`});
  });
}

$(function(){ 
  update_copy_gist();
  update_cran_status();
  update_conda_status();
  update_open_issues();
  update_dataset_onclick();
  enable_default_tooltips();
  update_citation_html();
  update_readme_html();
  update_commit_chart();
  update_contributor_tooltips();
  lazy_update_package_revdeps();
});
