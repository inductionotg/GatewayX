export function createRoundRobin(instances) {
  if (instances.length === 0) {
    throw new Error("At least one service instance is required");
  }

  const pool = [...instances];
  let nextIndex = 0;

  return function selectInstance() {
    const instance = pool[nextIndex];
    nextIndex = (nextIndex + 1) % pool.length;
    return instance;
  };
}
