window.onload = function(){
  /* Workaround for: https://github.com/desandro/masonry/issues/1147 */
  var msnry = new Masonry('.card-rows');
  $('.avatar').on('load', function(){
    msnry.layout();
    console.log("refresh")
  });
};
