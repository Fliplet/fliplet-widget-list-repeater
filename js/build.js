(function() {
  Fliplet.ListRepeater = Fliplet.ListRepeater || {};

  const listRepeaterInstances = {};
  const isInteract = Fliplet.Env.get('interact');

  // Decorate addEventListener function to add flag once some registered action is triggered
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'click') {
      originalAddEventListener.call(this, type, function(event) {
        listener(event);
        event._handled = true;
      }, options);
    } else {
      originalAddEventListener.call(this, type, listener, options);
    }
  };

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

  class ListRepeaterRow {
    constructor(repeater, row, index) {
      row.entryId = row.id;
      row.dataSourceId = repeater.connection?.id;
      this.repeater = repeater;
      this.row = row;
      this.index = index;
      this.element = null;
      this.data = {};
      this.viewContainer = undefined;
      this.isEditableRow = this.index === 0;
      this.key = getRowKey(row);
      this.entry = row;
      this.attrs = {
        'data-view': this.isEditableRow ? 'content' : undefined,
        'data-node-name': this.isEditableRow ? 'Content' : undefined
      };

      this.render();
      this.setupEventListeners();
    }

    render() {
      const rowElement = document.createElement('fl-list-repeater-row');

      rowElement.setAttribute('data-row-id', this.row.id);
      rowElement.setAttribute('data-key', this.key);

      Object.entries(this.attrs).forEach(([key, value]) => {
        if (value !== undefined) {
          rowElement.setAttribute(key, value);
        }
      });

      if (isInteract && !this.isEditableRow) {
        rowElement.classList.add('disabled');
      }

      rowElement.innerHTML = this.repeater.rowTemplate || (isInteract ? this.repeater.emptyTemplate : '');

      // Update template data
      if (!isInteract) {
        this.repeater.rowTemplatePaths.forEach((pathObject) => {
          const elements = rowElement.querySelectorAll(`[data-html-key="${pathObject.key}"]`);

          elements.forEach(el => {
            el.innerHTML = _.get(this.entry, pathObject.path) || '';
          });
        });
      }

      if (this.element) {
        this.element.replaceWith(rowElement);
      }

      this.element = rowElement;

      return rowElement;
    }

    setupEventListeners() {
      if (this.repeater.data.clickAction) {
        this.element.addEventListener('click', this.onClick.bind(this));
      }

      if (isInteract && this.isEditableRow) {
        this.viewContainer = new Fliplet.Interact.ViewContainer(this.element, {
          placeholder: this.repeater.emptyTemplate
        });

        Fliplet.Hooks.on('componentEvent', (eventData) => {
          // Render event from a child component
          if (eventData.type === 'render' || eventData.type === 'removed' || eventData.target.parents({ widgetId: this.repeater.data.id }).length) {
            this.onChangeDetected();
          }
        });

        // Components are updated
        this.viewContainer.onContentChange(() => {
          this.onChangeDetected();
        });
      }

      // Observe when the last row element is in view
      if (this.element?.nodeType === Node.ELEMENT_NODE && this.index === this.repeater.rows.length - 1) {
        this.repeater.lastRowObserver.observe(this.element);
      }

      Fliplet.Widget.initializeChildren(this.element, this).then(() => {
        Fliplet.Hooks.run('listRepeaterRowReady', { instance: this.repeater, row: this });
      });
    }

    onClick(event) {
      // Prevent the click action if it's already handled by another event or is a anchor link
      if (!this.repeater.data.clickAction || event._handled || event.target.tagName === 'A') {
        return;
      }

      const clickAction = { ...this.repeater.data.clickAction };

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

    onChangeDetected() {
      _.debounce(() => {
        const rowElement = this.element.cloneNode(true);
        const widgetInstances = rowElement.querySelectorAll('[data-fl-widget-instance]');
        const placeholder = this.element.querySelector('[data-view-placeholder]');
        const isConditionalContainerPlaceholder = placeholder && placeholder.textContent.trim().includes('Conditional container');

        if (widgetInstances.length && placeholder && !isConditionalContainerPlaceholder) {
          placeholder.remove();
        }

        this.repeater.rowTemplate = rowElement.innerHTML.trim();
        this.repeater.onTemplateChange();
      }, 200)();
    }

    update(row) {
      this.row = row;
      this.entry = row;
      this.key = getRowKey(row);
      this.render();
      this.setupEventListeners();

      Fliplet.Widget.initializeChildren(this.element, this).then(() => {
        Fliplet.Hooks.run('listRepeaterRowUpdated', { instance: this.repeater, row: this });
      });
    }

    destroy() {
      if (this.viewContainer) {
        this.viewContainer.destroy();
      }

      Fliplet.Widget.destroyChildren(this.element);
      this.element.remove();
    }
  }

  class ListRepeater {
    constructor(element, data) {
      this.element = element;
      this.data = data;
      this.id = data.id;
      this.uuid = data.uuid;
      this.isLoading = false;
      this.error = undefined;
      this.rows = undefined;
      this.rowComponents = [];
      this.pendingUpdates = {
        inserted: [],
        updated: [],
        deleted: []
      };
      this.subscription = undefined;
      this.direction = data.direction || 'vertical';
      this.noDataTemplate = data.noDataContent || T('widgets.listRepeater.noDataContent');
      this.connection = undefined;
      this.dataSourceId = undefined;
      this.parent = undefined;
      this.rowTemplatePaths = [];
      this.testDataObject = {};
      this.pageSize = 10; // Initial page size
      this.currentOffset = 0;
      this.hasMoreData = true;
      this.loadingIndicator = null;

      this.element.classList.add(this.direction);

      // Create loading indicator
      this.loadingIndicator = document.createElement('div');
      this.loadingIndicator.className = 'list-repeater-loading hidden';
      this.loadingIndicator.innerHTML = '<p class="text-center"><i class="fa fa-refresh fa-spin fa-fw"></i> Loading more...</p>';
      this.element.appendChild(this.loadingIndicator);

      // Setup intersection observer for infinite scroll
      this.lastRowObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isLoading && this.hasMoreData) {
            this.loadMore();
          }
        });
      });

      this.init();
    }

    async init() {
      // Initialize templates
      const $rowTemplate = $(this.element).find('template[name="row"]').eq(0);
      const $emptyTemplate = $(this.element).find('template[name="empty"]').eq(0);

      // Process row template
      this.processRowTemplate($rowTemplate);
      this.emptyTemplate = $emptyTemplate.html();

      $rowTemplate.remove();
      $emptyTemplate.remove();

      // Find parent
      [this.parent] = await Fliplet.Widget.findParents({
        instanceId: this.data.id,
        filter: { package: 'com.fliplet.dynamic-container' }
      });

      if (!this.parent) {
        Fliplet.UI.Toast('Please add this component inside a Data container');

        return Promise.reject('Data list must be placed inside a Data container');
      }

      this.parent = await Fliplet.DynamicContainer.get(this.parent.id);

      if (!this.parent || !this.parent.connection) {
        Fliplet.UI.Toast('Please configure the Data container with a data source');

        return Promise.reject('Data container is not properly configured');
      }

      // Initialize container
      await this.loadData();

      // Setup event listeners
      this.setupEventListeners();
    }

    processRowTemplate($rowTemplate) {
      const rowTemplate = $('<div></div>').html($rowTemplate.html() || '');

      rowTemplate.find('fl-prop[data-path]').each((i, el) => {
        const path = normalizePath(el.getAttribute('data-path'));
        let pathObject = _.get(this.testDataObject, path);

        if (!pathObject) {
          pathObject = { path, key: getHtmlKeyFromPath(path) };
          _.set(this.testDataObject, path, pathObject);
          this.rowTemplatePaths.push(pathObject);
        }

        el.setAttribute('data-html-key', pathObject.key);
      });

      this.rowTemplate = rowTemplate.html();
    }

    render() {
      if (!this.element) {
        return;
      }

      if (this.error) {
        this.element.innerHTML = `
          <div class="list-repeater-load-error">
            <p data-translate="widgets.listRepeater.errors.loadingData"></p>
            <p><small>${Fliplet.parseError(this.error)}</small></p>
          </div>
        `;

        return;
      }

      // Show loading indicator for both initial and subsequent loads
      if (this.loadingIndicator) {
        if (this.isLoading) {
          this.loadingIndicator.classList.remove('hidden');
        } else {
          this.loadingIndicator.classList.add('hidden');
        }
      }

      // For initial load with no data yet, just show the loader
      if (!this.rows) {
        return;
      }

      requestAnimationFrame(() => {
        const rowElements = this.element.querySelectorAll('fl-list-repeater-row');
        const allRowsEmpty = Array.from(rowElements).every(row => row.children.length === 0);

        if (!isInteract && (rowElements.length === 0 || allRowsEmpty)) {
          this.element.innerHTML = `<p class="text-center">${this.noDataTemplate}</p>`;
        }

        return;
      });

      // Only render new rows
      const startIndex = this.rowComponents.length;
      const newRows = this.rows.slice(startIndex);

      // Render new rows
      newRows.forEach((row, index) => {
        const rowComponent = new ListRepeaterRow(this, row, startIndex + index);

        this.rowComponents.push(rowComponent);
        this.element.appendChild(rowComponent.element);
      });

      // Make sure loading indicator is always at the bottom
      if (this.loadingIndicator) {
        this.element.appendChild(this.loadingIndicator);
      }
    }

    async loadData() {
      this.isLoading = true;
      this.render();

      try {
        if (isInteract) {
          this.rows = sampleData;
        } else if (this.parent && typeof this.parent.connection === 'function') {
          this.connection = await this.parent.connection();

          const baseQuery = {
            where: this.getFilterQuery(),
            order: this.getSortOrder(),
            limit: this.pageSize,
            offset: this.currentOffset,
            includePagination: true
          };

          const hookResult = await Fliplet.Hooks.run('repeaterBeforeRetrieveData', {
            instance: this,
            data: baseQuery
          });

          // Merge hook results with base query
          const query = hookResult.reduce((acc, curr) => {
            return {
              ...acc,
              ...curr,
              where: curr.where || acc.where,
              join: curr.join || acc.join,
              order: curr.order || acc.order
            };
          }, baseQuery);

          const response = await this.connection.find(query);

          // Handle paginated response
          if (response.entries) {
            this.rows = this.rows || [];
            this.rows.push(...response.entries);
            this.hasMoreData = response.entries.length === this.pageSize;
          } else {
            this.rows = response;
            this.hasMoreData = response.length === this.pageSize;
          }

          if (this.rows.length && ['informed', 'live'].includes(this.data.updateType)) {
            this.subscribe();
          }
        }

        this.render();

        await Fliplet.Hooks.run('repeaterDataRetrieved', {
          container: this.element,
          data: this.rows,
          instance: this
        });
      } catch (error) {
        this.error = error;
        console.error('[DATA LIST] Error fetching data', error);

        await Fliplet.Hooks.run('repeaterDataRetrieveError', {
          instance: this,
          error
        });
      } finally {
        this.isLoading = false;
        this.render();
        $(this.element).translate();
      }
    }

    async loadMore() {
      if (this.isLoading || !this.hasMoreData) {
        return;
      }

      this.currentOffset += this.pageSize;
      await this.loadData();
    }

    subscribe(cursor) {
      if (this.subscription) {
        this.subscription.unsubscribe();
      }

      const events = ['insert', 'update', 'delete'];

      this.subscription = this.connection.subscribe(
        { cursor, events },
        (bundle) => {
          if (events.includes('insert')) {
            this.onInsert(bundle.inserted);
          }

          if (events.includes('update')) {
            this.onUpdate(bundle.updated);
          }

          if (events.includes('delete')) {
            this.onDelete(bundle.deleted);
          }

          if (this.data.updateType === 'live') {
            this.applyUpdates();
          } else if (this.hasPendingUpdates()) {
            Fliplet.UI.Toast({
              message: 'New data available',
              duration: false,
              actions: [
                {
                  label: 'Refresh',
                  action: () => this.applyUpdates()
                },
                {
                  icon: 'fa-times',
                  title: 'Ignore',
                  action: () => {}
                }
              ]
            });
          }
        }
      );
    }

    onTemplateChange() {
      this.rowComponents.forEach((rowComponent, index) => {
        if (index === 0) {
          rowComponent.element.style.padding = '0';
          rowComponent.element.style.textAlign = 'left';

          return;
        }

        rowComponent.render();
      });
    }

    onInsert(insertions = []) {
      this.pendingUpdates.inserted.push(...insertions);
    }

    onUpdate(updates = []) {
      updates.forEach(update => {
        const existingIndex = this.pendingUpdates.updated.findIndex(row => row.id === update.id);

        if (existingIndex !== -1) {
          this.pendingUpdates.updated[existingIndex] = update;
        } else {
          this.pendingUpdates.updated.push(update);
        }
      });
    }

    onDelete(deletions = []) {
      deletions.forEach(deletion => {
        // Remove from inserted if present
        const insertedIndex = this.pendingUpdates.inserted.findIndex(row => row.id === deletion.id);

        if (insertedIndex !== -1) {
          this.pendingUpdates.inserted.splice(insertedIndex, 1);

          return;
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
    }

    applyUpdates() {
      // Add new rows
      this.rows.push(...this.pendingUpdates.inserted);

      // Update existing rows
      this.pendingUpdates.updated.forEach(update => {
        const index = this.rows.findIndex(row => row.id === update.id);

        if (index !== -1) {
          this.rows[index] = update;
          this.rowComponents[index]?.update(update);
        }
      });

      // Remove deleted rows
      this.pendingUpdates.deleted.forEach(deletedId => {
        const index = this.rows.findIndex(row => row.id === deletedId);

        if (index !== -1) {
          this.rows.splice(index, 1);
          this.rowComponents[index].destroy();
          this.rowComponents.splice(index, 1);
        }
      });

      // Reset pending updates
      this.pendingUpdates = {
        inserted: [],
        updated: [],
        deleted: []
      };

      this.render();
    }

    hasPendingUpdates() {
      return Object.values(this.pendingUpdates).some(value => value.length);
    }

    getFilterQuery() {
      const filters = this.data.filters || [];
      const query = {};

      filters.forEach((filter) => {
        let value;

        switch (filter.type) {
          case 'profile':
            value = this.getProfileValue(filter.profileKey);
            break;
          case 'query':
            value = Fliplet.Navigate.query[filter.query];
            break;
          case 'appStorage':
            value = Fliplet.App.Storage.get(filter.appStorageKey);
            break;
          default:
            value = filter.value;
        }

        // Skip if value is undefined
        if (typeof value === 'undefined') {
          return;
        }

        // Handle different operators
        switch (filter.logic) {
          case 'empty':
            query[filter.field] = null;
            break;
          case 'notempty':
            query[filter.field] = { $ne: null };
            break;
          case '!=':
            query[filter.field] = { $ne: value };
            break;
          case 'contains':
            query[filter.field] = { $iLike: value };
            break;
          case 'notcontain':
            query[filter.field] = { $not: { $iLike: value } };
            break;
          default: // equals
            query[filter.field] = value;
        }
      });

      return query;
    }

    getProfileValue(key) {
      return _.get(Fliplet.Session.get('user'), key);
    }

    getSortOrder() {
      return (this.data.sorts || []).map(sort => [`data.${sort.field}`, sort.order || 'asc']);
    }

    setupEventListeners() {
      // Add any necessary event listeners here
    }

    destroy() {
      if (this.subscription) {
        this.subscription.unsubscribe();
      }

      this.lastRowObserver.disconnect();
      this.rowComponents.forEach(component => component.destroy());
    }
  }

  Fliplet.Widget.instance('list-repeater', function(data) {
    const repeater = new ListRepeater(this, data);

    listRepeaterInstances[data.id] = repeater;

    return repeater;
  }, {
    supportsDynamicContext: true
  });

  Fliplet.ListRepeater.get = function(filter, options) {
    if (typeof filter === 'string') {
      filter = { name: filter };
    }

    options = options || { ts: 10 };

    return Fliplet().then(function() {
      return Promise.all(_.values(listRepeaterInstances)).then(function(repeaters) {
        let repeater;

        if (typeof filter === 'undefined') {
          repeater = repeaters.length ? repeaters[0] : undefined;
        } else {
          repeater = _.find(repeaters, filter);
        }

        if (!repeater) {
          if (options.ts > 5000) {
            return Promise.reject('Data list not found after ' + Math.ceil(options.ts / 1000) + ' seconds.');
          }

          return new Promise(function(resolve) {
            setTimeout(function() {
              options.ts = options.ts * 1.5;
              Fliplet.ListRepeater.get(filter, options).then(resolve);
            }, options.ts);
          });
        }

        return repeater;
      });
    });
  };

  Fliplet.ListRepeater.getAll = function(filter) {
    if (typeof filter === 'string') {
      filter = { name: filter };
    }

    return Fliplet().then(function() {
      return Promise.all(_.values(listRepeaterInstances)).then(function(repeaters) {
        if (typeof filter === 'undefined') {
          return repeaters;
        }

        return _.filter(repeaters, filter);
      });
    });
  };
})();
