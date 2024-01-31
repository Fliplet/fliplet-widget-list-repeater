Fliplet.Widget.generateInterface({
  fields: [
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
      name: 'limit',
      type: 'text',
      label: 'Show number of records / pages',
      placeholder: 'Default: 10'
    }
  ]
});
