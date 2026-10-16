function update_api_callbacks(){

  function update_packages_url(){
    var package = $('#api-packages-package').val();
    var pkguniv = $('#api-packages-package option:selected').attr("data-universe") || universe;
    var postfix = (package && package[0] !== '?') ? `/${package}` : package;
    var url = `https://${pkguniv}.r-universe.dev/api/packages${postfix}`;
    $("#api-packages-url input").val(url);
    $("#api-packages-url a").attr('href', url);
  }

  // Only offer formats that worked when the package was built, same as the download modal
  function update_dataset_formats(){
    var selected = $('#api-dataset-data').find(":selected");
    var table = selected.attr('data-table') !== undefined;
    var tojson = selected.attr('data-tojson') !== undefined;
    var df = selected.attr('data-df') !== undefined;
    var supported = {csv: table, xlsx: table && df, json: tojson, ndjson: tojson && df, rda: true, rds: true};
    var select = $('#api-dataset-format');
    select.find('option').each(function(){
      $(this).prop('disabled', !supported[$(this).val()]);
    });
    if(select.find(':selected').prop('disabled')){
      select.val(select.find('option:not(:disabled)').first().val());
    }
  }

  function update_dataset_url(){
    var selected = $('#api-dataset-data').find(":selected");
    var name = selected.attr('data-name');
    var package = selected.attr('data-package');
    var pkguniv = selected.attr('data-universe');
    var format = $('#api-dataset-format').val();
    var url = `https://${pkguniv}.r-universe.dev/${package}/data/${name}/${format}`;
    $("#api-dataset-url input").val(url);
    $("#api-dataset-url a").attr('href', url);
  }

  function update_snapshot_url(){
    var types = $("input:checkbox[name=types]:checked").map(function(){return $(this).val()}).get().join();
    var binaries = $("input:checkbox[name=binaries]:checked").map(function(){return $(this).val()}).get().join();
    var packages = $('#api-snapshot-packages').val().join();
    var need_binaries = !types || types.match('win|mac|linux')
    var params = [];
    if(types.length){
      params.push(`types=${types}`);
    }
    if(binaries.length && need_binaries){
      params.push(`binaries=${binaries}`);
    }
    if(packages.length){
      params.push(`packages=${packages}`);
    }

    var url = `https://${universe}.r-universe.dev/api/snapshot/zip`;
    if(params.length){
      url = url + "?" + params.join("&");
    }
    $("#api-snapshot-url input").val(url);
    $("#api-snapshot-url a").attr('href', url);
    $("input:checkbox[name=binaries]").prop('disabled', !need_binaries);
  }
  $('#snapshot-form input,#snapshot-form select').change(update_snapshot_url).trigger('change');
  $('#api-packages-package').change(update_packages_url).trigger("change");
  $('#api-dataset-data').change(update_dataset_formats);
  $('#api-dataset-data,#api-dataset-format').change(update_dataset_url);

  if($('#api-dataset-data option').length){
    $('#api-dataset-data').trigger('change')
  } else {
    $('#api-dataset-container').hide();
  };
}

$(function(){
  update_api_callbacks()
});
