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

Fliplet.Widget.instance('list-repeater', function(data, parent) {
  const $rowTemplate = $(this).find('> template[name="row"]');
  const $emptyTemplate = $(this).find('> template[name="empty"]');
  const templateViewName = 'content';
  const templateNodeName = 'Content';
  let compiledRowTemplate;

  let rowTemplate = ($rowTemplate.html() || '').replace(/<fl-prop data-path="([^"]+)"/g, (match, key) => {
    return `<fl-prop v-html="${key}" data-path="${key}"`;
  }).trim();
  const emptyTemplate = $emptyTemplate.html();

  $rowTemplate.remove();
  $emptyTemplate.remove();

  const container = new Promise((resolve) => {
    _.extend(data, {
      rows: [], /* To re-enable shared state: parent && parent.context || [] */
      parent,
      cursor: undefined
    });

    data.direction = data.direction || 'vertical';

    function getTemplateForHtml() {
      return `<fl-list-repeater-row :data-row-id="key" :key="key" :class="classes" v-bind="attrs" v-on:click="onClick">${rowTemplate || emptyTemplate}</fl-list-repeater-row>`;
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
            'data-view': isEditableRow ? templateViewName : undefined,
            'data-node-name': isEditableRow ? templateNodeName : undefined
          }
        };
      },
      methods: {
        onClick() {
          if (!data.clickAction) {
            return;
          }

          const clickAction = _.merge({}, data.clickAction);

          // Add data source entry ID to query string
          if (clickAction.action === 'screen') {
            // @TODO: Add support for Fliplet.Navigate.queryStringToObject() and Fliplet.Navigate.objectToQueryString()
            // const query = Fliplet.Navigate.queryStringToObject(clickAction.query || '');
            // const dataSourceEntryId = _.get(this.row, 'id');

            // if (dataSourceEntryId && !query.dataSourceEntryId) {
            //   query.dataSourceEntryId = dataSourceEntryId;
            //   clickAction.query = Fliplet.Navigate.objectToQueryString(query);
            // }
            clickAction.query = clickAction.query || '';
            clickAction.query += `${clickAction.query ? '&' : ''}dataSourceEntryId=${this.row.id}`;
          }

          Fliplet.Navigate.to(clickAction);
        }
      },
      computed: {
        isEmpty() {
          return !rowTemplate;
        }
      },
      render(createElement) {
        return compiledRowTemplate.render.call(this, createElement);
      },
      mounted() {
        Fliplet.Widget.initializeChildren(this.$el, this);

        if (!isInteract) {
          return;
        }

        if (this.index === 0) {
          this.$nextTick(() => {
            // Update screen structure in Studio after rendering
            Fliplet.Studio.emit('update-dom');
          });

          // @TODO: Add MutationObserver to detect show/hide view placeholder when content is removed/added
        }

        Fliplet.Studio.onEvent((event) => {
          const eventType = _.get(event, 'detail.type');

          switch (eventType) {
            case 'domUpdated':
              if (this.index === 0) {
                rowTemplate = this.$el.innerHTML.trim();
                compiledRowTemplate = Vue.compile(getTemplateForHtml());
              }

              this.$forceUpdate();
              break;
            default:
              break;
          }
        });
      },
      beforeDestroy() {
        Fliplet.Widget.destroyChildren(this.$el);
      }
    });

    // List component
    const vm = new Vue({
      el: this,
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
        const cursorData = {
          limit: _.get(data, 'limit', 10)
        };

        return Fliplet.Hooks.run('repeaterBeforeRetrieveData', { instance: vm, data: cursorData }).then(() => {
          return connection.findWithCursor(cursorData);
        });
      }).catch((error) => {
        Fliplet.Hooks.run('repeaterDataRetrieveError', { instance: vm, error });

        return [];
      });
    } else if (isInteract) {
      loadData = Promise.resolve(sampleData);
    } else {
      loadData = Promise.resolve();
    }

    loadData.then((result = []) => {
      // Limit results displayed in the UI
      if (isInteract) {
        if (!result.length) {
          result = sampleData;
        }

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

Fliplet.ListRepeater.get = function(filter, options) {
  if (typeof filter === 'string') {
    filter = { name: filter };
  }

  options = options || { ts: 10 };

  return Fliplet().then(function() {
    return Promise.all(repeatedListInstances).then(function(containers) {
      var container;

      if (typeof filter === 'undefined') {
        container = containers.length ? containers[0] : undefined;
      } else {
        container = _.find(containers, filter);
      }

      if (!container) {
        if (options.ts > 5000) {
          return Promise.reject(`Repeated List instance not found after ${Math.ceil(options.ts / 1000)} seconds.`);
        }

        // Containers can render over time, so we need to retry later in the process
        return new Promise(function(resolve) {
          setTimeout(function() {
            options.ts = options.ts * 1.5;

            Fliplet.ListRepeater.get(filter, options).then(resolve);
          }, options.ts);
        });
      }

      return container;
    });
  });
};

Fliplet.ListRepeater.getAll = function(filter) {
  if (typeof filter === 'string') {
    filter = { name: filter };
  }

  return Fliplet().then(function() {
    return Promise.all(repeatedListInstances).then(function(containers) {
      if (typeof filter === 'undefined') {
        return containers;
      }

      return _.filter(containers, filter);
    });
  });
};
