$(function(){
  /* Workaround for: https://github.com/desandro/masonry/issues/1147 */
  var msnry = new Masonry('#package-card-container');
  $('.package-details-logo').on('load', function(){
    msnry.layout();
    console.log("refresh")
  });
});
