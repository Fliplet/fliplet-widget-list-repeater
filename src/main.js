import Application from './Application.vue';

new Vue({
  el: '#list-repeater',
  render: (createElement) => {
    return createElement(Application);
  }
});
