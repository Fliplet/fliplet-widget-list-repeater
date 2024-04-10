(function() {
  Fliplet.ListRepeater = Fliplet.ListRepeater || {};

  const repeatedListInstances = {};
  const isInteract = Fliplet.Env.get('interact');

  const sampleData = isInteract
    ? [
      { id: 1, data: {} },
      { id: 2, data: {} },
      { id: 3, data: {} }
    ]
    : undefined;

  function getHtmlKeyFromPath(path) {
    return `data${CryptoJS.MD5(path).toString().substr(-6)}`;
  }

  function normalizePath(path) {
    return path.startsWith('$') ? path.substr(1) : `entry.data.${path}`;
  }

  Fliplet.Widget.instance('list-repeater', function(data, parent) {
    const $rowTemplate = $(this).find('template[name="row"]').eq(0);
    const $emptyTemplate = $(this).find('template[name="empty"]').eq(0);
    const templateViewName = 'content';
    const templateNodeName = 'Content';
    const rowTemplatePaths = [];
    const testDataObject = {};
    let compiledRowTemplate;

    let rowTemplate = $('<div></div>').html($rowTemplate.html() || '').find('fl-prop[data-path]').each(function(i, el) {
      const path = normalizePath(el.getAttribute('data-path'));
      let pathObject = _.get(testDataObject, path);

      if (!pathObject) {
        // Provide a unique alphanumeric key for the path suitable for v-html
        pathObject = { path, key: getHtmlKeyFromPath(path) };
        _.set(testDataObject, path, pathObject);
        rowTemplatePaths.push(pathObject);
      }

      el.setAttribute('v-html', `data.${ pathObject.key }`);
    }).end().html();
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

        rowTag.setAttribute(':data-row-id', 'row.id');
        rowTag.setAttribute(':key', 'key');
        rowTag.setAttribute(':class', 'classes');
        rowTag.setAttribute('v-bind', 'attrs');
        rowTag.setAttribute('v-on:click', 'onClick');

        $(rowTag).html(rowTemplate || (isInteract ? emptyTemplate : ''));

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
            data: {},
            viewContainer: undefined
          };

          return result;
        },
        watch: {
          row() {
            this.setData();
            this.entry = this.row;
          }
        },
        methods: {
          setData() {
            if (isInteract) {
              return;
            }

            // Loop through the row template paths and set the data for v-html
            rowTemplatePaths.forEach((pathObject) => {
              this.$set(this.data, pathObject.key, _.get(this, pathObject.path));
            });
          },
          forceRender() {
            // Never update the first row as this will cause an infinite loop
            if (this.index === 0) {
              return;
            }

            // Generate a new GUID and take the last 4 characters
            const newSuffix = new Date().getTime();

            // Regular expression to match a hyphen followed by exactly four characters at the end of the string
            const regex = /-\d{13}$/;

            // Check if the original string matches the pattern
            if (regex.test(this.key)) {
              // Replace the last 4 characters with the new GUID suffix
              this.key = this.key.replace(regex, `-${newSuffix}`);
            } else {
              // Append the new suffix to the original string
              this.key = `${this.key}-${newSuffix}`;
            }
          },
          onChangeDetected: _.debounce(function() {
            rowTemplate = this.$el.innerHTML.trim();
            compiledRowTemplate = Vue.compile(getTemplateForHtml());

            this.$parent.onTemplateChange();
          }, 200),
          onClick() {
            if (!data.clickAction) {
              return;
            }

            const clickAction = { ...data.clickAction };

            // Add data source entry ID to query string
            if (clickAction.action === 'screen') {
              clickAction.query = clickAction.query || '';

              // If the query string already contains a dataSourceEntryId, don't add it again
              if (!/(&|^)dataSourceEntryId=/.test(clickAction.query)) {
                let separator = '';

                if (clickAction.query && !clickAction.query.endsWith('&')) {
                  separator = '&';
                }

                clickAction.query += `${separator}dataSourceEntryId=${this.row.id}`;
              }
            }

            Fliplet.Navigate.to(clickAction);
          }
        },
        render(createElement) {
          return compiledRowTemplate.render.call(this, createElement);
        },
        mounted() {
          this.setData();

          Fliplet.Widget.initializeChildren(this.$el, this);

          // Observe when the last row is in view
          if (this.index === this.$parent.rows.length - 1) {
            this.$parent.lastRowObserver.observe(this.$el);
          }

          Fliplet.Hooks.run('listRepeaterRowReady', { instance: vm, row: this });

          if (!isInteract) {
            return;
          }

          /* Edit mode only */

          if (this.index === 0) {
            this.viewContainer = new Fliplet.Interact.ViewContainer(this.$el, {
              placeholder: emptyTemplate
            });

            Fliplet.Hooks.on('componentEvent', (eventData) => {
              // Render event from a child component
              if (eventData.type === 'render' || eventData.target.parents({ widgetId: data.id }).length) {
                this.onChangeDetected();
              }
            });

            // Components are updated
            this.viewContainer.onContentChange(() => {
              this.onChangeDetected();
            });
          }
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
          onTemplateChange() {
            this.$children.forEach(($row, index) => {
              if (index === 0) {
                return;
              }

              $row.forceRender();
            });
          },
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

    container.id = data.id;
    repeatedListInstances[data.id] = container;
  }, {
    supportsDynamicContext: true
  });

  Fliplet.ListRepeater.get = function(filter, options) {
    if (typeof filter === 'string') {
      filter = { name: filter };
    }

    options = options || { ts: 10 };

    return Fliplet().then(function() {
      return Promise.all(_.values(repeatedListInstances)).then(function(containers) {
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
      return Promise.all(_.values(repeatedListInstances)).then(function(containers) {
        if (typeof filter === 'undefined') {
          return containers;
        }

        return _.filter(containers, filter);
      });
    });
  };
})();
