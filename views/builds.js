function make_activity_chart(){
  return get_json('/api/updates').then(function(updates){
    const data = activity_data(updates);
    const ctx = document.getElementById('activity-canvas');
    return new Chart(ctx, {
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
  //delegated handler: binding to thousands of buttons individually is slow for large universes
  $(document).on('click', '.retry-button', function(e){
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
    }).catch(alert);
  });
}

function enable_default_tooltips(){
  //lazily create tooltips on hover, instead of instantiating thousands of them on page load
  const selector = '[data-bs-toggle="tooltip"]';
  new bootstrap.Tooltip(document.body, {selector: selector, delay: {show:300}});
  $(document).on('click', selector, function(){
    this.blur();
    bootstrap.Tooltip.getInstance(this)?.hide();
  });
}

$(function(){
  update_retry_buttons();
  enable_default_tooltips();
  make_activity_chart();
});
