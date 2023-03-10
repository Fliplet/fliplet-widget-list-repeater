<template>
  <div>
    <Query-Option></Query-Option>
  </div>
</template>

<script>
import state from './state';
import QueryOption from './components/QueryOptions';

export default {
  data() {
    return {};
  },
  components: {
    QueryOption
  },
  mounted() {
    Fliplet.Widget.onSaveRequest(async() => {
      await Fliplet.Widget.save(state);
      Fliplet.Widget.complete();
    });
  }
};
</script>
