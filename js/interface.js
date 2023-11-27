Fliplet.Widget.generateInterface({
  title: 'List Repeater',
  fields: [
    {
      type: 'provider',
      name: 'clickAction',
      label: 'Click action',
      package: 'com.fliplet.link'
    },
    {
      name: 'limit',
      type: 'text',
      label: 'Show number of records / pages',
      placeholder: 'Default: 10'
    }
  ]
});
