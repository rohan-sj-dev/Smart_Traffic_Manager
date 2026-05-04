export const workloadState = {
  ml: { running: false, count: 0 },
  matrix: { running: false, count: 0 },
  image: { running: false, count: 0 },
};

const listeners = new Set();

export function subscribeWorkloads(listener) {
  listeners.add(listener);
  listener({ ...workloadState });
  return () => listeners.delete(listener);
}

export function updateWorkload(name, data) {
  workloadState[name] = { ...workloadState[name], ...data };
  listeners.forEach(l => l({ ...workloadState }));
}