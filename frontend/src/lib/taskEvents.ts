export const TASKS_CHANGED_EVENT = 'mingo:tasks-changed';
export const TASKS_CHANGED_STORAGE_KEY = 'mingoTasksUpdatedAt';

export const notifyTasksChanged = () => {
  localStorage.setItem(TASKS_CHANGED_STORAGE_KEY, String(Date.now()));
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
};
