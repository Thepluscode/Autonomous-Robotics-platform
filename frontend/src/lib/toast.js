// Imperative toast API.
//
// Pages call `toast.success("Saved!")`, `toast.error("Failed to save", { description })`,
// `toast.info(...)` from anywhere — there's no hook, no provider lookup, no
// prop drilling. The actual rendering is done by a single `<Toaster />`
// mounted at the App root, which subscribes to this store. We deliberately
// did not pull in `sonner` / `react-hot-toast` for this — the API surface
// the codebase needs is small, and a 50-line file beats a third-party dep
// update on a security-prereq path.
//
// Lifecycle:
//   - `toast.<level>(title, options?)` pushes a toast onto the store and
//     returns the id, which can be used with `toast.dismiss(id)` for early
//     removal (otherwise dismissed automatically after `duration` ms).
//   - The Toaster subscribes once on mount; every push triggers a re-render
//     of the toast list.

const DEFAULT_DURATION = 4000;

let nextId = 1;
const listeners = new Set();
let toasts = [];

function emit() {
  for (const listener of listeners) listener(toasts);
}

function push(level, title, options = {}) {
  const id = nextId++;
  const toastEntry = {
    id,
    level,
    title,
    description: options.description,
    duration: options.duration ?? DEFAULT_DURATION,
  };
  toasts = [...toasts, toastEntry];
  emit();
  if (toastEntry.duration > 0) {
    setTimeout(() => dismiss(id), toastEntry.duration);
  }
  return id;
}

export function dismiss(id) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  // Replay current state so a freshly-mounted Toaster shows in-flight toasts.
  listener(toasts);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (title, options) => push("success", title, options),
  error: (title, options) => push("error", title, options),
  info: (title, options) => push("info", title, options),
  warning: (title, options) => push("warning", title, options),
  dismiss,
};

// Test/debug hook — clears all toasts and counters. Used by unit tests
// that exercise the store directly without mounting the Toaster.
export function _resetForTests() {
  toasts = [];
  listeners.clear();
  nextId = 1;
}
