export type MemberType = {
  id: string;
  username: string;
}

export const useMemberStore = defineStore('member', () => {
  const list = ref<MemberType[]>([]);

  const join = (member: MemberType) => {
    list.value = [...list.value.filter((m) => m.id !== member.id), member];
  };

  const leave = (id: string) => {
    list.value = list.value.filter((m) => m.id !== id);
  };

  onBeforeUnmount(() => {
    list.value = [];
  });

  return { list, join, leave };
});
