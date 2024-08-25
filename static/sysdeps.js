$(function(){
  new DataTable('table', {
    searching: true,
    paging: false,
    lengthChange: false,
    info: false,
    language: { search: "Filter: "},
    initComplete: function () {
      $('div.dt-search').addClass("float-end")
      $('div.dt-search input').removeClass('dt-input').addClass('m-2')
    }
  });
  $("table")
});
