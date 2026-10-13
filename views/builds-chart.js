function make_activity_chart(updates){
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
}

//Load chart libraries without blocking the parser, so the chart can render
//while a (possibly large) table below is still being parsed.
function load_scripts(urls){
  return Promise.all(urls.map(function(url){
    return new Promise(function(resolve, reject){
      const script = document.createElement('script');
      script.src = url;
      script.async = false; //execute in order
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }));
}

Promise.all([get_json('/api/updates'), load_scripts([
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-adapter-moment/1.0.1/chartjs-adapter-moment.min.js'
])]).then(([updates]) => make_activity_chart(updates));
