export type ShortcutId = 'add' | 'nospend' | 'recap';

// Browsers have no app icon to long-press.
export async function registerShortcuts(): Promise<void> {}
export function onShortcut(_handler: (id: ShortcutId) => void): () => void {
  return () => {};
}
