function sort_packages(array){
  return array.sort((a, b) => (a.count > b.count) ? -1 : 1);
}

function make_contributor_chart(max = 20){
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
      render_avatars(); //remove here if it is too slow
    }).catch(function(e){
      console.log("Failed to load image: " + url);
    });
  }

  var hovered = -1;

  function render_avatars(){
    var xAxis = myChart.scales.x;
    var yAxis = myChart.scales.y;
    yAxis.ticks.forEach((value, index) => {
      var y = yAxis.getPixelForTick(index);
      var img = images[index];
      if(!img) return;
      myChart.ctx.save();
      myChart.ctx.beginPath();
      myChart.ctx.roundRect(xAxis.right + 5, y - size/2, size, size, 50);
      myChart.ctx.clip()
      myChart.ctx.drawImage(img, xAxis.right + 5, y - size/2, size, size);
      myChart.ctx.restore();
      if(index === hovered){
        myChart.ctx.save();
        myChart.ctx.beginPath();
        myChart.ctx.arc(xAxis.right + 5 + size/2, y, size/2 + 2, 0, 2 * Math.PI);
        myChart.ctx.lineWidth = 3;
        myChart.ctx.strokeStyle = 'rgba(54, 162, 235, 1)';
        myChart.ctx.stroke();
        myChart.ctx.restore();
      }
    });
  }

  // redraw the chart to add or remove the ring around the hovered avatar
  function set_hovered(index){
    if(index === hovered) return;
    hovered = index;
    myChart.draw();
    render_avatars();
  }

  // index of the avatar at chart position (x, y), or -1
  function avatar_at(x, y){
    var xAxis = myChart.scales.x;
    var yAxis = myChart.scales.y;
    if(x < xAxis.right + 5 || x > xAxis.right + 5 + size) return -1;
    return yAxis.ticks.findIndex((value, index) => Math.abs(y - yAxis.getPixelForTick(index)) <= size/2);
  }

  const ctx = document.getElementById('contributors-canvas');
  $(ctx).height(logins.length * (size + 10) + 50);
  ctx.onclick = function(e){
    const pts = myChart.getElementsAtEventForMode(e, 'nearest', {intersect: true}, true);
    const index = pts.length ? pts[0].index : avatar_at(e.offsetX, e.offsetY);
    if(index > -1){
      const contrib = logins[index];
      window.location.href = `https://${contrib}.r-universe.dev/contributors`;
    }
  };

  /* NB: to disable animation alltogether (for performance) we need to set
     options.animation: false, and uncomment the afterDraw handler */

  // set the cursor here, not in onHover: chart.js only calls that inside the chart area
  ctx.onmousemove = function(e){
    const pts = myChart.getElementsAtEventForMode(e, 'nearest', {intersect: true}, true);
    const avatar = avatar_at(e.offsetX, e.offsetY);
    ctx.style.cursor = (pts.length || avatar > -1) ? 'pointer' : 'default';
    set_hovered(avatar);
  };
  ctx.onmouseleave = function(){
    set_hovered(-1);
  };

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
}

$(function(){
  make_contributor_chart()
});
