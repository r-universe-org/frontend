function get_user_data(user, max){
  const p1 = get_ndjson(`${server}/stats/contributors?all=true&limit=${max}`);
  const p2 = get_ndjson(`${server}/stats/contributions?limit=100&skipself=1&cutoff=0`);
  return Promise.all([p1, p2]).then(function(results){
    return results;
  });
}

function sort_packages(array){
  return array.sort((a, b) => (a.count > b.count) ? -1 : 1);
}

function combine_results(results, max){
  const contributions = results[1];
  if(contributions.length == 0){
    return results[0];
  }
  var data = results[0].map(function(x){
    x.contributions = 0;
    x.packages = [];
    return x;
  });
  contributions.forEach(function(x, i){
    x.maintainers.forEach(function(maintainer){
      var rec = data.find(y => y.login == maintainer);
      if(!rec){
        rec = {login: maintainer, total: 0, contributions: 0, repos: [], packages: []};
        data.push(rec);
      }
      rec.contributions = rec.contributions + x.contributions;
      rec.packages = rec.packages.concat(x.packages);
    });
  });
  return data.sort(function(x,y){return (x.total + x.contributions > y.total + y.contributions) ? -1 : 1}).slice(0,max);
}

function make_contributor_chart(max = 20){
  return get_user_data(universe, max).then(function(results){
    const contributors = combine_results(results, max).filter(x => x.login != universe);
    const size = 50;
    const logins = contributors.map(x => x.login);
    const totals = contributors.map(x => x.total);
    const contribs = contributors.map(x => -1* x.contributions);
    const contribpkgs = contributors.map(x => x.packages);
    const mypkgs = contributors.map(x => sort_packages(x.repos).map(x => x.upstream.split(/[\\/]/).pop()));
    const avatars = logins.map(x => avatar_url(x, size));
    const images = avatars.map(x => undefined);
    const promises = avatars.map(download_avatar);

    function download_avatar(url, index){
      var img = new Image();
      img.src = url;
      return img.decode().then(function(x){
        images[index] = img;
      }).catch(function(e){
        console.log("Failed to load image: " + url);
      });
    }

    function render_avatars(){
      var xAxis = myChart.scales.x;
      var yAxis = myChart.scales.y;
      yAxis.ticks.forEach((value, index) => {
        var y = yAxis.getPixelForTick(index);
        var img = images[index];
        if(!img) return;
        myChart.ctx.save();
        myChart.ctx.roundRect(xAxis.right + 5, y - size/2, size, size, 50);
        myChart.ctx.clip()
        myChart.ctx.drawImage(img, xAxis.right + 5, y - size/2, size, size);
        myChart.ctx.restore();
      });
    }

    const ctx = document.getElementById('contributors-canvas');
    $(ctx).height(logins.length * (size + 10) + 50);
    ctx.onclick = function(e){
      const pts = myChart.getElementsAtEventForMode(e, 'nearest', {intersect: true}, true);
      if(pts.length){
        const x = pts[0];
        const contrib = logins[x.index];
        window.location.href = `https://${contrib}.r-universe.dev/contributors`;
      }
    };

    /* NB: to disable animation alltogether (for performance) we need to set
       options.animation: false, and uncomment the afterDraw handler */

    const myChart = new Chart(ctx, {
      type: 'bar',
      plugins: [{
//        afterDraw: render_avatars
      }],
      data: {
        labels: logins,
        datasets: [{
          label: 'incoming',
          data: totals,
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          borderSkipped: false,
          borderRadius: 5,
          //minBarLength: 10
        },{
          label: 'outgoing',
          data: contribs,
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          borderSkipped: false,
          borderRadius: 5,
          //minBarLength: 10
        }]
      },
      options: {
        //events: [], //disable all hover events, much faster (but no tooltips)
        animation : {
          duration: 200,
          onComplete: render_avatars,
          onProgress: render_avatars
        },
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins : {
          legend: false,
          title: {
            display: false,
            text: `Contributions by/to ${universe}`
          },
          tooltip: {
            animation: false,
            callbacks: {
              title:function(item){
                const label = item[0].label;
                return item[0].datasetIndex ? `${universe} to ${label}` : `${label} to ${universe}`;
              },
              label: function(item) {
                let packages = item.datasetIndex ? contribpkgs[item.dataIndex] : mypkgs[item.dataIndex];
                let len = packages.length;
                if(len > 5){
                  return ` Contributed to ${packages.slice(0,4).join(', ')} and ${packages.length-4} other projects`;
                } else if(len > 1) {
                  return ` Contributed to ${packages.slice(0,len-1).join(', ')} and ${packages[len-1]}`;
                } else {
                  return ` Contributed to ${packages[0]}`;
                }
              }
            }
          }
        },
        layout: {
          padding: {
            right: 60
          }
        },
        onHover: function(event, el){
          event.native.target.style.cursor = el[0] ? 'pointer' : 'default';
        },
        scales: {
          y: {
            stacked: true,
            ticks: {
              beginAtZero: true
              //padding: 60
              //callback: function(value, index, ticks){
              //  var whitespace = ' '.repeat(15);
              //  return whitespace + logins[value];
              //}
              /* Padding above has a weord bug that also adds padding to the top of the chart
                 Therefore we use the callback to add spaces before the label instead */
            }
          },
          x: {
            stacked: true,
            ticks: {
              //maxRotation: 90,
              //minRotation: 90,
              display: true,
              callback: Math.abs
            }
          },
        }
      }
    });
    // in case images were still downloading when chart was rendered
    Promise.all(promises).then(() => render_avatars());
  });
}

$(function(){
  make_contributor_chart()
});
