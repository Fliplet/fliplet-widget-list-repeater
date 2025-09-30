# Plan: Implement Infinite Scrolling with Cursor-based Pagination

## Overview

This plan outlines the implementation of infinite scrolling functionality using `connection.findWithCursor()` instead of `connection.find()` and replacing scroll position detection with the Intersection Observer API to trigger loading when the second-to-last entry becomes visible.

**Reference:** https://developers.fliplet.com/API/fliplet-datasources.html#advanced-pagination-with-cursor

## Current State Analysis

### Current Implementation (`build.js`)
- Uses `connection.find()` with manual offset/limit pagination
- Has basic Intersection Observer setup that observes the last row
- Maintains `pageSize`, `currentOffset`, and `hasMoreData` properties
- Implements `loadMore()` method that increments offset
- Has loading indicator management

### Data Source API Analysis (`datasources.js`)
- `findWithCursor()` returns a cursor object with:
  - `next()` method to move to next page
  - `prev()` method to move to previous page
  - `update()` method to fetch data with `keepExisting` option
  - `isLastPage` property to indicate if more data is available
  - Acts as an array (can push items, has length property)
  - Tracks `idSet` for duplicate prevention

### README Documentation
- Shows examples using `repeater.rows.next().update({ keepExisting: true })`
- Assumes `repeater.rows` is a cursor object with pagination methods

## Implementation Plan

### Phase 1: Replace `connection.find()` with `connection.findWithCursor()`

#### 1.1 Update `loadData()` method in `ListRepeater` class

**Current code to replace:**
```javascript
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
```

**New implementation:**
```javascript
if (!this.rows) {
  // Initial load - create cursor
  this.rows = await this.connection.findWithCursor(query);
  this.hasMoreData = !this.rows.isLastPage;
} else {
  // Subsequent loads - use existing cursor
  await this.rows.next().update({ keepExisting: true });
  this.hasMoreData = !this.rows.isLastPage;
}
```

#### 1.2 Remove offset-based pagination properties

**Properties to remove from constructor:**
- `this.pageSize` (cursor handles this internally)
- `this.currentOffset` (cursor manages offset)

**Keep but rename:**
- `this.hasMoreData` → derived from `this.rows.isLastPage`

#### 1.3 Update `loadMore()` method

**Current implementation:**
```javascript
async loadMore() {
  if (this.isLoading || !this.hasMoreData) {
    return;
  }

  this.currentOffset += this.pageSize;
  await this.loadData();
}
```

**New implementation:**
```javascript
async loadMore() {
  if (this.isLoading || !this.hasMoreData || !this.rows) {
    return;
  }

  this.isLoading = true;
  this.render(); // Show loading indicator

  try {
    await this.rows.next().update({ keepExisting: true });
    this.hasMoreData = !this.rows.isLastPage;
    this.render(); // Render new rows
  } catch (error) {
    this.error = error;
    console.error('[DATA LIST] Error loading more data', error);
  } finally {
    this.isLoading = false;
    this.render();
  }
}
```

### Phase 2: Improve Intersection Observer Implementation

#### 2.1 Modify trigger point from last row to second-to-last row

**Current logic in `ListRepeaterRow.setupEventListeners()`:**
```javascript
// Observe when the last row element is in view
if (this.element?.nodeType === Node.ELEMENT_NODE && this.index === this.repeater.rows.length - 1) {
  this.repeater.lastRowObserver.observe(this.element);
}
```

**New implementation:**
```javascript
// Observe when the second-to-last row element is in view
const triggerIndex = Math.max(0, this.repeater.rows.length - 2);
if (this.element?.nodeType === Node.ELEMENT_NODE && this.index === triggerIndex) {
  this.repeater.lastRowObserver.observe(this.element);
}
```

#### 2.2 Update observer management in render method

**Add observer cleanup logic:**
```javascript
// In ListRepeater.render() method, before rendering new rows:
// Disconnect previous observers for second-to-last elements
this.lastRowObserver.disconnect();

// After rendering new rows, re-establish observer on new second-to-last element
const triggerIndex = Math.max(0, this.rowComponents.length - 2);
if (this.rowComponents[triggerIndex]?.element) {
  this.lastRowObserver.observe(this.rowComponents[triggerIndex].element);
}
```

### Phase 3: Update Query Structure and Initialization

#### 3.1 Modify base query structure

**Current query structure:**
```javascript
const baseQuery = {
  where: this.getFilterQuery(),
  order: this.getSortOrder(),
  limit: this.pageSize,
  offset: this.currentOffset,
  includePagination: true
};
```

**New query structure:**
```javascript
const baseQuery = {
  where: this.getFilterQuery(),
  order: this.getSortOrder(),
  limit: this.data.pageSize || 10, // Get from widget config or default
  // Remove offset and includePagination - cursor handles this
};
```

### Phase 4: Update Public API to Match Documentation

#### 4.1 Ensure `Fliplet.ListRepeater.get()` returns expected structure

**The documentation shows `repeater.rows.next().update()`, so `repeater.rows` should be the cursor.**

Current structure needs verification - `this.rows` should be the cursor object that supports:
- `next()` method
- `update()` method
- Array-like behavior (indexing, length)

### Phase 5: Handle Edge Cases and Error Scenarios

#### 5.1 Handle cursor initialization failure

```javascript
// In loadData() method
try {
  if (!this.rows) {
    this.rows = await this.connection.findWithCursor(query);
    if (!this.rows || typeof this.rows.next !== 'function') {
      throw new Error('Failed to create data cursor');
    }
  }
  // ... rest of implementation
} catch (error) {
  // Fallback to offset-based pagination if cursor fails
  console.warn('Cursor-based pagination failed, falling back to offset-based', error);
  // Implement fallback logic
}
```

### Phase 6: Implementation Order and Testing

#### 6.1 Implementation Steps

1. **Test current `findWithCursor` functionality** - Create simple test to understand response structure
2. **Update `loadData()` method** - Replace `find()` with `findWithCursor()`
3. **Update `loadMore()` method** - Use cursor's `next().update()` pattern
4. **Update Intersection Observer** - Change trigger to second-to-last element
5. **Remove offset-based properties** - Clean up constructor and related code
6. **Test infinite scrolling** - Ensure smooth loading and no duplicates
7. **Handle edge cases** - Empty data, errors, etc.
8. **Update documentation** - README.md updates

#### 6.2 Testing Scenarios

- **Initial load** with various data sizes (0, 1, 5, 15 items)
- **Infinite scroll** through multiple pages
- **Filter changes** that reset the cursor
- **Real-time updates** with subscription while scrolling
- **Error scenarios** like network failures during scroll
- **Performance** with large datasets

### Phase 7: Breaking Changes and Migration

#### 7.1 Potential Breaking Changes

**Public API changes:**
- `repeater.rows` changes from array to cursor object
- Removal of `pageSize`, `currentOffset` properties from public interface
- Behavior of `loadMore()` method changes

**Mitigation strategies:**
- Cursor object should maintain array-like interface (indexing, length, forEach, etc.)
- Add backward compatibility properties if needed
- Document migration path for custom infinite scroll implementations

## Expected Outcomes

1. **Improved Performance**: Cursor-based pagination is more efficient for large datasets
2. **Better UX**: Second-to-last trigger provides smoother scrolling experience
3. **Consistent API**: Matches documented examples in README
4. **Maintainable Code**: Removes manual offset management complexity
5. **Future-Proof**: Cursor pattern supports advanced features like real-time sync

## Risks and Mitigation

1. **Cursor API Compatibility**: Test thoroughly with various data sources
2. **Performance Regression**: Monitor load times and memory usage
3. **Breaking Changes**: Provide clear migration guide and backward compatibility where possible
4. **Real-time Updates**: Ensure subscription system works with cursor state

## Success Criteria

- [ ] Infinite scroll works smoothly with cursor-based pagination
- [ ] Loading triggers at second-to-last element visibility
- [ ] No duplicate data is loaded
- [ ] Performance is equal or better than current implementation
- [ ] Real-time updates continue to work
- [ ] All existing functionality remains intact
