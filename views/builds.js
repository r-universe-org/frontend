function make_activity_chart(){
  return get_ndjson(`${server}/stats/updates?all=true`).then(function(updates){
    const data = activity_data(updates);
    const ctx = document.getElementById('activity-canvas');
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
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'month'
                }
            }
        },
        plugins : {
          legend: false,
          title: {
            display: false,
            text: "Weekly package updates in " + universe
          },
          tooltip: {
            animation: false,
            callbacks: {
              title: function(items){
                return `Week ${data[items[0].dataIndex].date.getWeek()}`
              },
              label: function(item) {
                let packages = data[item.dataIndex].packages;
                let len = packages.length;
                if(len > 5){
                  return ` Updates in ${packages.slice(0,4).join(', ')} and ${packages.length-4} other packages`;
                } else if(len > 1) {
                  return ` Updates in ${packages.slice(0,len-1).join(', ')} and ${packages[len-1]}`;
                } else {
                  return ` Updates in ${packages[0]}`;
                }
              }
            }
          }
        },
        layout: {
          padding: 20
        }
      }
    });
  });
}

function update_retry_buttons(){
 $(".retry-button").each(function(){
    var link = $(this);
    link.tooltip({title: `Retry failed builds for ${link.attr('data-pkgver')}`});
  });
  $(".retry-button").click(function(e){
    e.preventDefault();
    var link = $(this)
    fetch(link.attr("data-retry-url"), {
      method: "PATCH"
    }).then(function(res){
      if(!res.ok){
        return res.text().then((err) => {
          throw new Error(`HTTP ${res.status}: ${err}`);
        });
      }
      alert(`Success! Retrying failed build for: ${link.attr('data-pkgver')}`);
      window.location = link.attr("href");
    }).catch(alert).finally(function(){
      // tooltip.dispose()
    })
  });
}

function update_tooltips(){
  $('.cross-universe-icon').each(function(){
    var icon = $(this);
    icon.tooltip({title: `Package from other universe (${icon.attr('data-universe')})`});
  });
}

$(function(){
  update_retry_buttons();
  update_tooltips();
  make_activity_chart();
});
