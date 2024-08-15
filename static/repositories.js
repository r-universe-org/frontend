$(function(){
  new DataTable('table', {
    searching: true,
    paging: true,
    pageLength: 200,
    lengthChange: false,
    columns: [null, { type: 'num' }, { type: 'num' }, { type: 'num' }, {orderable: false}, {orderable: false}, null],
    order: [],
    language: { search: "Filter: "},
    initComplete: function () {
      $('div.dt-search').addClass("float-end")
      $('div.dt-search input').removeClass('dt-input').addClass('m-2')
    }
  });
  $("table").removeClass('d-none')
});
