(function() {
  Fliplet.ListRepeater = Fliplet.ListRepeater || {};

  const repeatedListInstances = {};
  const isInteract = Fliplet.Env.get('interact');

  const now = new Date().toISOString();
  const sampleData = isInteract
    ? [
      { id: 1, data: {}, updatedAt: now },
      { id: 2, data: {}, updatedAt: now },
      { id: 3, data: {}, updatedAt: now }
    ]
    : undefined;

  function getHtmlKeyFromPath(path) {
    return `data${CryptoJS.MD5(path).toString().substr(-6)}`;
  }

  function normalizePath(path) {
    return path.startsWith('$') ? path.substr(1) : `entry.data.${path}`;
  }

  function getRowKey(row) {
    if (!row) {
      return Fliplet.guid();
    }

    return `${row.id}-${new Date(row.updatedAt).getTime()}`;
  }

  Fliplet.Widget.instance('list-repeater', async function(data) {
    const $rowTemplate = $(this).find('template[name="row"]').eq(0);
    const $emptyTemplate = $(this).find('template[name="empty"]').eq(0);
    const templateViewName = 'content';
    const templateNodeName = 'Content';
    const rowTemplatePaths = [];
    const testDataObject = {};
    let compiledRowTemplate;

    let rowTemplate = $('<div></div>').append($($rowTemplate.html() || '').find('fl-prop[data-path]').each(function(i, el) {
      const path = normalizePath(el.getAttribute('data-path'));
      let pathObject = _.get(testDataObject, path);

      if (!pathObject) {
        // Provide a unique alphanumeric key for the path suitable for v-html
        pathObject = { path, key: getHtmlKeyFromPath(path) };
        _.set(testDataObject, path, pathObject);
        rowTemplatePaths.push(pathObject);
      }

      el.setAttribute('v-html', `data.${ pathObject.key }`);
    }).end()).html();
    const emptyTemplate = $emptyTemplate.html();

    $rowTemplate.remove();
    $emptyTemplate.remove();

    let [parent] = await Fliplet.Widget.findParents({
      instanceId: data.id,
      filter: { package: 'com.fliplet.dynamic-container' }
    });

    if (parent) {
      parent = await Fliplet.DynamicContainer.get(parent.id);
    }

    const container = new Promise((resolve) => {
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
            this.entry = this.row;
            this.setData();
          },
          key() {
            Fliplet.Widget.initializeChildren(this.$el, this);

            Fliplet.Hooks.run('listRepeaterRowUpdated', { instance: vm, row: this });
          }
        },
        computed: {
          key() {
            return getRowKey(this.row);
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
          return {
            id: data.id,
            uuid: data.uuid,
            isInteract,
            isLoading: false,
            error: undefined,
            lastRowObserver: undefined,
            rows: [],
            pendingUpdates: {
              inserted: [],
              updated: [],
              deleted: []
            },
            subscription: undefined,
            direction: data.direction || 'vertical',
            noDataTemplate: data.noDataContent ||  T('widgets.listRepeater.noDataContent')
          };
        },
        computed: {
          hasPendingUpdates() {
            return Object.values(this.pendingUpdates).some(value => value.length);
          }
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
          },
          onInsert(insertions = []) {
            insertions.forEach(insertion => {
              // Since it's an insert, just add to the inserted array
              // Check if already exists in inserted to replace it (it shouldn't happen but just in case)
              const existingIndex = this.pendingUpdates.inserted.findIndex(row => row.id === insertion.id);

              if (existingIndex !== -1) {
                this.$set(this.pendingUpdates.inserted, existingIndex, insertion);
              } else {
                this.pendingUpdates.inserted.push(insertion);
              }
            });
          },
          onUpdate(updates = []) {
            updates.forEach(update => {
              // Check if the entry exists in inserted; if so, update it there
              const insertedIndex = this.pendingUpdates.inserted.findIndex(row => row.id === update.id);

              if (insertedIndex !== -1) {
                this.$set(this.pendingUpdates.inserted, insertedIndex, update);

                return;
              }

              // Otherwise, update or add to the updated array
              const existingIndex = this.pendingUpdates.updated.findIndex(row => row.id === update.id);

              if (existingIndex !== -1) {
                this.$set(this.pendingUpdates.updated, existingIndex, update);
              } else {
                this.pendingUpdates.updated.push(update);
              }
            });
          },
          onDelete(deletions = []) {
            deletions.forEach(deletion => {
              // Remove from inserted if present
              const insertedIndex = this.pendingUpdates.inserted.findIndex(row => row.id === deletion.id);

              if (insertedIndex !== -1) {
                this.pendingUpdates.inserted.splice(insertedIndex, 1);

                return; // No need to add to deleted since it was never applied
              }

              // Remove from updated if present
              const updatedIndex = this.pendingUpdates.updated.findIndex(row => row.id === deletion.id);

              if (updatedIndex !== -1) {
                this.pendingUpdates.updated.splice(updatedIndex, 1);
              }

              // Finally, add to deleted if not already there and not in inserted
              if (!this.pendingUpdates.deleted.includes(deletion.id)) {
                this.pendingUpdates.deleted.push(deletion.id);
              }
            });
          },
          applyUpdates() {
            // Apply inserted entries
            // TODO: Insert entries in the correct order
            this.rows.push(...this.pendingUpdates.inserted);

            // Apply updated entries
            this.pendingUpdates.updated.forEach(update => {
              const index = this.rows.findIndex(row => row.id === update.id);

              if (index !== -1) {
                this.$set(this.rows, index, update);
              }
            });

            // Remove deleted entries
            this.pendingUpdates.deleted.forEach(deletedId => {
              const index = this.rows.findIndex(row => row.id === deletedId);

              if (index !== -1) {
                this.rows.splice(index, 1);
              }
            });

            // Reset pendingUpdates
            this.pendingUpdates = {
              inserted: [],
              updated: [],
              deleted: []
            };
          },
          subscribe(connection, cursor) {
            switch (data.updateType) {
              case 'informed':
              case 'live':
                // Deletions can be handled but currently isn't being monitored
                // because API is incomplete to provide the necessary information
                var events = ['update'];

                this.subscription = connection.subscribe({ cursor, events }, (bundle) => {
                  if (events.includes('insert')) {
                    this.onInsert(bundle.inserted);
                  }

                  if (events.includes('update')) {
                    this.onUpdate(bundle.updated);
                  }

                  if (events.includes('delete')) {
                    this.onDelete(bundle.deleted);
                  }

                  if (data.updateType === 'live') {
                    this.applyUpdates();
                  } else if (this.hasPendingUpdates) {
                    // Show toast message
                    Fliplet.UI.Toast({
                      message: 'New data available',
                      duration: false,
                      actions: [
                        {
                          label: 'Refresh',
                          action() {
                            vm.applyUpdates();
                          }
                        },
                        {
                          label: 'Ignore',
                          action() {
                            // Do nothing
                          }
                        }
                      ]
                    });
                  }
                });
                break;
              case 'none':
              default:
                break;
            }
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
          }).then((cursor) => {
            vm.subscribe(connection, cursor);

            return cursor;
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
    if (typeof filter !== 'object' || typeof filter !== 'function') {
      filter = { id: filter };
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
    if (typeof filter !== 'object' || typeof filter !== 'function') {
      filter = { id: filter };
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
