Fliplet.ListRepeater = Fliplet.ListRepeater || {};

const repeatedListInstances = [];
const isInteract = Fliplet.Env.get('interact');

const sampleData = isInteract
  ? [
    { id: 1, data: {} },
    { id: 2, data: {} },
    { id: 3, data: {} }
  ]
  : undefined;

Fliplet.Widget.instance('repeated-list', function(data, parent) {
  const $rowTemplate = $(this).find('> template[name="row"]');
  let compiledRowTemplate;

  let rowTemplate = ($rowTemplate.html() || '').replace(/<fl-prop data-path="([^"]+)"/g, (match, key) => {
    return `<fl-prop v-html="${key}" data-path="${key}"`;
  });

  $rowTemplate.remove();

  const container = new Promise((resolve) => {
    _.extend(data, {
      rows: [], /* To re-enable shared state: parent && parent.context || [] */
      parent,
      cursor: undefined
    });

    data.direction = data.direction || 'vertical';

    function getTemplateForHtml() {
      return `<fl-list-repeater-row :data-row-id="key" :key="key" :class="classes" v-bind="attrs">${rowTemplate}</fl-list-repeater-row>`;
    }

    compiledRowTemplate = Vue.compile(getTemplateForHtml());

    // Row component
    const rowComponent = Vue.component(data.rowView, {
      props: ['row', 'index'],
      data() {
        const isEditableRow = this.index === 0;

        return {
          key: this.row && this.row.id || Fliplet.guid(),
          classes: {
            readonly: isInteract && !isEditableRow
          },
          attrs: {
            'data-view': isEditableRow ? 'content' : undefined,
            'data-node-name': isEditableRow ? 'Content' : undefined
          }
        };
      },
      render(createElement) {
        return compiledRowTemplate.render.call(this, createElement);
      },
      mounted() {
        Fliplet.Widget.initializeChildren(this.$el, this, '[data-fl-widget-instance], fl-list-repeater');

        if (isInteract) {
          if (this.index === 0) {
            this.$nextTick(() => {
              Fliplet.Studio.emit('update-dom');
            });
          }

          Fliplet.Studio.onEvent((event) => {
            if (event.detail && event.detail.type === 'domUpdated') {
              if (this.index === 0) {
                rowTemplate = this.$el.innerHTML;
                compiledRowTemplate = Vue.compile(getTemplateForHtml());
              }

              this.$forceUpdate();
            }
          });
        }
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

    /*
    // Shared state - disabled
    if (parent && parent.context) {
      parent.$watch('context', function(context) {
        if (context !== vm.rows) {
          vm.rows = context;
        }
      });
    }
    */

    let loadData;

    // Fetch data using the dynamic container connection
    if (parent && typeof parent.connection === 'function') {
      loadData = parent.connection().then((connection) => {
        const cursorData = _.pick(data, ['limit']);

        return Fliplet.Hooks.run('repeaterBeforeRetrieveData', { instance: vm, data: cursorData }).then(() => {
          return connection.findWithCursor(cursorData).catch(function(error) {
            Fliplet.Hooks.run('repeaterDataRetrieveError', { instance: vm, error: error });
          });
        });
      });
    } else if (isInteract) {
      loadData = Promise.resolve(sampleData);
    } else {
      loadData = Promise.resolve();
    }

    loadData.then((result) => {
      // Limit results displayed in the UI
      if (isInteract) {
        result.splice(sampleData.length);
      }

      vm.rows = result;
      resolve(vm);



      Fliplet.Hooks.run('repeaterDataRetrieved', { instance: vm, data: result });
    }).catch(() => {
      resolve(vm);
    });
  });

  repeatedListInstances.push(container);
}, {
  supportsDynamicContext: true
});

Fliplet.ListRepeater.get = function(name, options) {
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

            Fliplet.ListRepeater.get(name, options).then(resolve);
          }, options.ts);
        });
      }

      return container;
    });
  });
};

Fliplet.ListRepeater.getAll = function(name) {
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
