# Fliplet Data list widget

## Development

This widget is meant to be used with the Fliplet platform.

Run for local development with the [`fliplet-cli`](https://github.com/Fliplet/fliplet-cli):

```
$ npm install
$ npm run watch
```

You can also manually build the source code with `npm run build`

Then, keep the watcher running and on a new tab run the following command:

```
$ fliplet run
```

---
# JS APIs

The following JS APIs are available in a screen once a **Data list** component is dropped into the screen.

## Retrieve an instance

Since you can have many data list components in a screen, we provide a handy function to grab a specific instance by its name or the first one available in the page when no input parameter is given.

### `Fliplet.ListRepeater.get()`

Retrieves the first or a specific Single data record instance.

```js
// Get the first repeater instance
Fliplet.ListRepeater.get()
  .then(function (repeater) {
    // Use repeater object to perform various actions
  });

// Get the first repeater instance named 'foo'
Fliplet.ListRepeater.get('foo')
  .then(function (repeater) {
    // Use repeater object to perform various actions
  });
```

The `container` instance variable above is a `Vue` compatible instance with the following properties available:

- `direction`: `vertical` or `horizontal`
- `rows`: Cursor object for the Data Source with array-like behavior (supports `length`, index access) and pagination methods like `next()` and `update()`
- `el`: DOM Element
- `template`: the list row template

---

## Retrieve all instances

Use the `getAll` method of the namespace to get all instances at once:

```js
Fliplet.ListRepeater.getAll().then(function (repeaters) {
  // Use repeaters
});
```

---

## Hooks

### repeaterDataRetrieved

Use the `repeaterDataRetrieved` hook to mutate data after it's been retrieved from the Data Source JS APIs:

```js
Fliplet.Hooks.on('repeaterDataRetrieved', function(options) {
  // options contains "container" and "data"

  // e.g. mutate the data array/object before it's rendered
  options.data.push({ Name: 'John' });

  // Return a promise if this callback should be async.
});
```

---

### repeaterBeforeRetrieveData

Use the `repeaterBeforeRetrieveData` hook to mutate data before it gets sent to the Data Source JS APIs for querying:

```js
Fliplet.Hooks.on('repeaterBeforeRetrieveData', function(options) {
  // options contains "instance" and "data"

  // e.g. mutate the data
  options.data.where = {
    Office: 'London';
  };

  // change limit
  options.data.limit = 10;

  // Return a promise if this callback should be async.
});
```

### repeaterDataRetrieveError

Use the `repeaterDataRetrieveError` hook to handle errors when retrieving data from the Data Source JS APIs:

```js
Fliplet.Hooks.on('repeaterDataRetrieveError', function(result) {
  // result contains "instance" and "error"
  // e.g. show an alert
});
```

---

## Infinite scroll

The list repeater now includes built-in infinite scrolling powered by the Intersection Observer API. It automatically loads the next page when the second-to-last rendered row becomes visible.

- You don't need to add any window scroll listeners.
- The widget keeps existing entries as new pages are loaded for a smooth UX.

If you need manual control (e.g., trigger a load from custom UI), you can still advance the cursor:

```js
Fliplet.ListRepeater.get().then(function (repeater) {
  // Move to the next page of the dataset and keep existing entries
  repeater.rows.next().update({ keepExisting: true });
});
```

If you are paginating (changing pages rather than appending), call `update()` without `keepExisting` and refresh as needed:

```js
Fliplet.ListRepeater.get().then(function (repeater) {
  repeater.rows.next().update();
  repeater.$forceUpdate && repeater.$forceUpdate();
});
```

---

## Cursor fallback to offset pagination

This widget prefers cursor-based pagination for efficiency. If creating the cursor fails (e.g., environment or permission constraints), it automatically falls back to offset-based pagination using `find({ limit, offset })` under the hood.

- **Behavior**:
  - Initial load tries `findWithCursor(query)`.
  - On failure, switches to offset mode and performs `find({ ...query, limit, offset: 0 })`.
  - Infinite scrolling continues by incrementing `offset` by `limit` and appending results.
  - `hasMoreData` is computed from whether the last page returned `limit` items.

- **Manual loading in offset mode**:

```js
Fliplet.ListRepeater.get().then(function (repeater) {
  if (repeater._isOffsetMode) {
    // Triggers the same internal logic as the Intersection Observer
    repeater.loadMore();
  } else {
    // Cursor mode
    repeater.rows.next().update({ keepExisting: true });
  }
});
```
