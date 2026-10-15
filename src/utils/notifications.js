let messages = [];
let sequence = 0;
const listeners = new Set();
const timers = new Map();
const emit = () => listeners.forEach((listener) => listener());

export function dismissNotification(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  messages = messages.filter((item) => item.id !== id);
  emit();
}

function show(message, type) {
  if (!message || messages.some((item) => item.message === message && item.type === type)) return;
  const id = ++sequence;
  if (messages.length >= 3) dismissNotification(messages[0].id);
  messages = [...messages, { id, message, type }];
  emit();
  timers.set(id, setTimeout(() => dismissNotification(id), type === 'error' ? 8000 : 4500));
}

export const notify = {
  success: (message) => show(message, 'success'),
  error: (message) => show(message, 'error'),
};
export const subscribeNotifications = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getNotifications = () => messages;
