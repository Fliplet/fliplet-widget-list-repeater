Fliplet.RepeatedList = Fliplet.RepeatedList || {};

const repeatedListInstances = [];

Fliplet.Widget.instance('repeated-list', function(data, parent) {
  const $rowTemplate = $(this).find('> template[name="row"]');

  const rowTemplate = $rowTemplate.html().replace(/<fl-prop data-path="([^"]+)"/g, (match, key) => {
    return `<fl-prop v-html="${key}" data-path="${key}"`;
  });

  $rowTemplate.remove();

  const container = new Promise((resolve) => {
    // TODO: what to do in interact mode

    _.extend(data, {
      rows: parent && parent.context || [],
      parent
    });

    data.direction = data.direction || 'vertical';

    // Row component
    const rowComponent = Vue.component(data.rowView, {
      template: `<fl-list-repeater-row>${rowTemplate}</fl-list-repeater-row>`,
      props: ['row'],
      mounted() {
        Fliplet.Widget.initializeChildren(this.$el, this, '[data-fl-widget-instance], fl-list-repeater');
      },
      beforeDestroy() {
        Fliplet.Widget.destroyChildren(this.$el);
      }
    });

    // List component
    const vm = new Vue({
      el: $(this).find('> fl-list-repeater')[0],
      data,
      components: {
        row: rowComponent
      }
    });

    if (parent && parent.context) {
      parent.$watch('context', function(context) {
        if (context !== vm.rows) {
          vm.rows = context;
        }
      });
    }

    resolve(vm);
  });

  repeatedListInstances.push(container);
}, {
  supportsDynamicContext: true
});

Fliplet.RepeatedList.get = function(name, options) {
  options = options || { ts: 10 };

  return Fliplet().then(function() {
    return Promise.all(repeatedListInstances).then(function(containers) {
      var container;

      if (typeof name === 'undefined') {
        container = containers.length ? containers[0] : undefined;
      } else {
        containers.some(function(vm) {
          if (vm.name === name) {
            container = vm;

            return true;
          }
        });
      }

      if (!container) {
        if (options.ts > 5000) {
          return Promise.reject('RepeatedList not found after ' + Math.ceil(options.ts / 1000) + ' seconds.');
        }

        // Containers can render over time, so we need to retry later in the process
        return new Promise(function(resolve) {
          setTimeout(function() {
            options.ts = options.ts * 1.5;

            Fliplet.RepeatedList.get(name, options).then(resolve);
          }, options.ts);
        });
      }

      return container;
    });
  });
};

Fliplet.RepeatedList.getAll = function(name) {
  return Fliplet().then(function() {
    return Promise.all(repeatedListInstances).then(function(containers) {
      if (typeof name === 'undefined') {
        return containers;
      }

      return containers.filter(function(form) {
        return form.name === name;
      });
    });
  });
};
