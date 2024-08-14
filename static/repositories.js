$(function(){
  new DataTable('table', {
    searching: false,
    paging: false,
    columns: [null, { type: 'num' }, { type: 'num' }, { type: 'num' }, {orderable: false}, {orderable: false}, null],
    order: []
  });
});
