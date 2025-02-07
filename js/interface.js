async function getDataSourceColumns() {
  const parents = await Fliplet.Widget.findParents({ filter: { package: 'com.fliplet.dynamic-container' } });

  if (!parents.length) {
    console.error('This component needs to be placed inside a Data container component.');

    return;
  }

  const dynamicContainer = parents[0];

  if (!dynamicContainer.dataSourceId) {
    return;
  }

  const dataSource = await Fliplet.DataSources.getById(dynamicContainer.dataSourceId, { attributes: ['columns'] });

  return dataSource && _.orderBy(dataSource.columns, column => column.toLowerCase()) || [];
}

function toggleFilterField(filter, fieldName, value, compareValue) {
  const showValueFields = filter.field('valueType').isShown();

  filter.field(fieldName).toggle(showValueFields && value === compareValue);
}

(async function() {
  const dataSourceColumns = await getDataSourceColumns();

  Fliplet.Widget.generateInterface({
    fields: [
      {
        type: 'provider',
        package: 'com.fliplet.data-source-provider',
        data: function() {
          return Fliplet.Widget.findParents({ filter: { package: 'com.fliplet.dynamic-container' } }).then((widgets) => {
            const dynamicContainer = widgets[0];

            return {
              readonly: true,
              dataSourceTitle: 'Get data from...',
              dataSourceId: dynamicContainer && dynamicContainer.dataSourceId,
              helpText: 'To change this data source, go to the parent <strong>Data container</strong>'
            };
          });
        }
      },
      {
        name: 'filters',
        type: 'list',
        label: 'How do you want to filter your data?',
        addLabel: 'Add filter',
        headingFieldName: 'field',
        fields: [
          {
            name: 'field',
            type: 'dropdown',
            label: 'Data field',
            required: true,
            placeholder: '-- Select a column',
            options: dataSourceColumns
          },
          {
            name: 'logic',
            type: 'dropdown',
            label: 'Logic',
            required: true,
            placeholder: false,
            default: '==',
            options: [
              {
                label: 'Is empty',
                value: 'empty'
              },
              {
                label: 'Is not empty',
                value: 'notempty'
              },
              {
                label: 'Equals',
                value: '=='
              },
              {
                label: "Doesn't equal",
                value: '!='
              },
              {
                label: 'Text contains',
                value: 'contains'
              },
              {
                label: "Text doesn't contain",
                value: 'notcontain'
              }
            ],
            change: function(value) {
              const filter = Fliplet.Helper.field(this.listName).get(this.index);
              const showValueFields = value !== 'empty' && value !== 'notempty';

              filter.field('valueType').toggle(showValueFields);

              const valueType = filter.field('valueType').get();

              toggleFilterField(filter, 'value', valueType, 'static');
              toggleFilterField(filter, 'profileKey', valueType, 'profile');
              toggleFilterField(filter, 'query', valueType, 'pageQuery');
              toggleFilterField(filter, 'appStorageKey', valueType, 'appStorage');
            },
            ready: function($el, value) {
              const filter = Fliplet.Helper.field(this.listName).get(this.index);
              const showValueFields = value !== 'empty' && value !== 'notempty';

              filter.field('valueType').toggle(showValueFields);
            }
          },
          {
            name: 'valueType',
            label: 'Value type',
            type: 'dropdown',
            required: true,
            placeholder: false,
            default: 'static',
            options: [
              {
                value: 'static',
                label: 'Enter a value'
              },
              {
                value: 'profile',
                label: 'User profile data'
              },
              {
                value: 'pageQuery',
                label: 'Link query parameter'
              },
              {
                value: 'appStorage',
                label: 'App storage data'
              }
            ],
            change: function(value) {
              const filter = Fliplet.Helper.field(this.listName).get(this.index);

              toggleFilterField(filter, 'value', value, 'static');
              toggleFilterField(filter, 'profileKey', value, 'profile');
              toggleFilterField(filter, 'query', value, 'pageQuery');
              toggleFilterField(filter, 'appStorageKey', value, 'appStorage');
            },
            ready: function($el, value) {
              const filter = Fliplet.Helper.field(this.listName).get(this.index);

              toggleFilterField(filter, 'value', value, 'static');
              toggleFilterField(filter, 'profileKey', value, 'profile');
              toggleFilterField(filter, 'query', value, 'pageQuery');
              toggleFilterField(filter, 'appStorageKey', value, 'appStorage');
            }
          },
          {
            name: 'value',
            label: 'Value',
            required: true,
            type: 'text',
            placeholder: 'Enter a value'
          },
          {
            name: 'profileKey',
            label: 'Value for...',
            required: true,
            type: 'text',
            placeholder: 'Enter profile key'
          },
          {
            name: 'query',
            label: 'Value for...',
            required: true,
            type: 'text',
            placeholder: 'Enter query parameter'
          },
          {
            name: 'appStorageKey',
            label: 'Value for...',
            required: true,
            type: 'text',
            placeholder: 'Enter app storage key'
          }
        ]
      },
      {
        name: 'sorts',
        type: 'list',
        label: 'How do you want to sort your data?',
        addLabel: 'Add sort condition',
        headingFieldName: 'field',
        fields: [
          {
            name: 'field',
            type: 'dropdown',
            label: 'Data field',
            required: true,
            placeholder: '-- Select a column',
            options: dataSourceColumns
          },
          {
            name: 'order',
            type: 'dropdown',
            label: 'Sort order',
            required: true,
            placeholder: false,
            default: 'asc',
            options: [
              {
                label: 'Ascending',
                value: 'asc'
              },
              {
                label: 'Descending',
                value: 'desc'
              }
            ]
          }
        ]
      },
      {
        type: 'provider',
        name: 'clickAction',
        package: 'com.fliplet.link',
        data: function(value) {
          return _.assign({}, value, {
            options: {
              actionLabel: 'Click action'
            }
          });
        }
      },
      {
        type: 'radio',
        name: 'updateType',
        label: 'Select mode for reactivity to data changes',
        required: true,
        default: 'none',
        options: [
          {
            value: 'none',
            label: '<strong>No Update</strong> - Updates are not silently applied and users won\'t see the changes until they load the list for the next time.'
          },
          {
            value: 'informed',
            label: '<strong>Informed Update</strong> - Users are informed if an update is available. When the user chooses to apply it, changes are applied in-situ, i.e. without a complete reload.'
          },
          {
            value: 'live',
            label: '<strong>Real-time Update</strong> - Updates are automatically applied when they are available. Detail view can be directly loaded (via query parameter) without loading the list first.'
          }
        ]
      },
      {
        name: 'noDataContent',
        type: 'textarea',
        label: 'Text to show if no data loaded',
        placeholder: 'Default: No data to display'
      }
    ]
  });
})();
