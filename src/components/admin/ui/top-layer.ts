// Stack of open modal <dialog>s. Content outside the topmost one is inert and painted below it
// (top layer), so overlays that must stay usable, such as toasts, portal into it.
let stack: HTMLDialogElement[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function pushDialog(dialog: HTMLDialogElement): void {
  stack = [...stack.filter((d) => d !== dialog), dialog]
  emit()
}

export function removeDialog(dialog: HTMLDialogElement): void {
  stack = stack.filter((d) => d !== dialog)
  emit()
}

export function subscribeTopDialog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTopDialog(): HTMLDialogElement | null {
  return stack.at(-1) ?? null
}
