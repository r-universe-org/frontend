$(function(){
  var name = {searchable: true, orderable: true};
  var date = {searchable: false, orderable: true};
  var text = {searchable: true, orderable: false};
  new DataTable('table', {
    searching: true,
//    ordering: false,
    paging: true,
    pageLength: 100,
    lengthChange: false,
    columns: [name, text, text, date],
    order: [],
    language: { search: "Filter: "},
    initComplete: function () {
      $('div.dt-search').addClass("float-end")
      $('div.dt-search input').removeClass('dt-input').addClass('m-2')
    }
  });
  $("table").removeClass('d-none')
});
