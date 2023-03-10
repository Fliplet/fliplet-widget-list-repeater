<template>
  <div class="form-group clearfix">
    <div class="col-sm-4 control-label">
      <label>Records per page (optional)</label>
      <p>Choose the number of records to display at any time. Leave empty if you want to load all records at once (not recommended).</p>
    </div>
    <div class="col-sm-8">
      <input type="number" style="width:100px" class="form-control" id="queryLimit" v-model="limit" value="default" min="0">
    </div>
    <hr />
  </div>
</template>

<script>
import state from '../state.js';

export default {
  data() {
    return {
      limit: state.limit
    };
  },
  watch: {
    limit(val) {
      state.limit = val;
    }
  }
};
</script>


