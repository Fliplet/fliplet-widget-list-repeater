<template>
  <form v-on:submit.prevent="onSubmit">
    <Query-Option></Query-Option>
  </form>
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
  methods: {
    async onSubmit() {
      await Fliplet.Widget.save(state);
      Fliplet.Widget.complete();
    }
  },
  mounted() {
    Fliplet.Widget.onSaveRequest(async() => {
      await this.onSubmit();
    });
  }
};
</script>
