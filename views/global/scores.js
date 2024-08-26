$(function(){
  var num = {type: 'num', searchable: false};
  new DataTable('table', {
    searching: true,
    paging: true,
    pageLength: 200,
    lengthChange: false,
    columns: [null, num, num, num, num, num, num, num, num, num, num],
    order: [],
    language: { search: "Filter: "},
    initComplete: function () {
      $('div.dt-search').addClass("float-end")
      $('div.dt-search input').removeClass('dt-input').addClass('m-2')
    }
  });
  $("table").removeClass('d-none')
});
