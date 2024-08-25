window.onload = function(){
  /* Workaround for: https://github.com/desandro/masonry/issues/1147 */
  const msnry = new Masonry('.card-rows');
  const refresh = debounce(() => msnry.layout());
  $('.avatar').on('load', refresh);
};

function debounce(func, timeout = 100){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}
