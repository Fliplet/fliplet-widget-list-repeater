(function() {
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

  function getHtmlKeyFromPath(path) {
    return `path${CryptoJS.MD5(path).toString().substr(-6)}`;
  }

  Fliplet.Widget.instance('list-repeater', function(data, parent) {
    const $rowTemplate = $(this).find('template[name="row"]').eq(0);
    const $emptyTemplate = $(this).find('template[name="empty"]').eq(0);
    const templateViewName = 'content';
    const templateNodeName = 'Content';
    const rowTemplatePaths = [];
    let compiledRowTemplate;

    let rowTemplate = $('<div></div>').append($($rowTemplate.html() || '').find('fl-prop[data-path]').each(function(i, el) {
      const path = el.getAttribute('data-path');

      if (rowTemplatePaths.indexOf(path) === -1) {
        rowTemplatePaths.push(path);
      }

      // Set the v-html attribute to a unique alphanumeric key based on the path
      el.setAttribute('v-html', `data.${ getHtmlKeyFromPath(path) }`);
    }).end()).html();
    const emptyTemplate = $emptyTemplate.html();

    $rowTemplate.remove();
    $emptyTemplate.remove();

    const container = new Promise((resolve) => {
      _.extend(data, {
        rows: undefined,
        parent
      });

      data.direction = data.direction || 'vertical';

      function getTemplateForHtml() {
        const rowTag = document.createElement('fl-list-repeater-row');

        rowTag.setAttribute(':data-row-id', 'key');
        rowTag.setAttribute(':key', 'key');
        rowTag.setAttribute(':class', 'classes');
        rowTag.setAttribute('v-bind', 'attrs');
        rowTag.setAttribute('v-on:click', 'onClick');

        rowTag.innerHTML = rowTemplate || (isInteract ? emptyTemplate : '');

        return rowTag.outerHTML;
      }

      compiledRowTemplate = Vue.compile(getTemplateForHtml());

      // Row component
      const rowComponent = Vue.component(data.rowView, {
        props: ['row', 'index'],
        data() {
          const isEditableRow = this.index === 0;
          const result = {
            key: this.row && this.row.id || Fliplet.guid(),
            entry: this.row,
            classes: {
              readonly: isInteract && !isEditableRow
            },
            attrs: {
              'data-view': isEditableRow ? templateViewName : undefined,
              'data-node-name': isEditableRow ? templateNodeName : undefined
            },
            data: {}
          };

          if (!isInteract) {
            // Loop through the row template paths and set the data for v-html
            rowTemplatePaths.forEach((path) => {
              result.data[getHtmlKeyFromPath(path)] = _.get(this, path);
            });
          }

          return result;
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
        render(createElement) {
          return compiledRowTemplate.render.call(this, createElement);
        },
        mounted() {
          Fliplet.Widget.initializeChildren(this.$el, this);

          // Observe when the last row is in view
          if (this.index === this.$parent.rows.length - 1) {
            this.$parent.lastRowObserver.observe(this.$el);
          }

          Fliplet.Hooks.run('listRepeaterRowReady', { instance: vm, row: this });

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
        data() {
          var result = {
            isInteract,
            isLoading: false,
            error: undefined,
            lastRowObserver: undefined,
            noDataTemplate: data.noDataContent ||  T('widgets.listRepeater.noDataContent')
          };

          return Object.assign(result, data);
        },
        components: {
          row: rowComponent
        },
        filters: {
          parseError(error) {
            return Fliplet.parseError(error);
          }
        },
        methods: {
          loadMore() {
            if (!this.rows || typeof this.rows.next !== 'function' || this.rows.isLastPage) {
              return;
            }

            this.isLoading = true;

            this.rows.next().update({ keepExisting: true }).then(() => {
              this.isLoading = false;
            }).catch(error => {
              this.isLoading = false;

              Fliplet.UI.errorToast(error, 'Error loading data');
            });
          }
        },
        mounted() {
          this.lastRowObserver = new IntersectionObserver((entries) => {
            const lastRow = entries[0];

            if (lastRow.isIntersecting) {
              this.lastRowObserver.unobserve(lastRow.target);
              this.loadMore();
            }
          });
        }
      });

      let loadData;

      // Fetch data using the dynamic container connection
      if (isInteract) {
        loadData = Promise.resolve(sampleData);
      } else if (parent && typeof parent.connection === 'function') {
        vm.isLoading = true;
        vm.error = undefined;

        loadData = parent.connection().then((connection) => {
          const cursorData = {
            limit: parseInt(_.get(data, 'limit'), 10) || 10
          };

          return Fliplet.Hooks.run('listRepeaterBeforeRetrieveData', { instance: vm, data: cursorData }).then(() => {
            return connection.findWithCursor(cursorData);
          });
        });
      } else {
        loadData = Promise.resolve();
      }

      loadData.then((result = []) => {
        vm.isLoading = false;
        vm.rows = result;
        resolve(vm);

        Fliplet.Hooks.run('listRepeaterDataRetrieved', { instance: vm, data: result });
      }).catch((error) => {
        vm.isLoading = false;
        vm.error = error;

        Fliplet.Hooks.run('listRepeaterDataRetrieveError', { instance: vm, error });

        vm.$nextTick(() => {
          $(vm.$el).find('.list-repeater-load-error').translate();
        });

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
})();
