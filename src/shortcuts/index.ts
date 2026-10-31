type QuickActions = typeof import('expo-quick-actions');

export type ShortcutId = 'add' | 'nospend' | 'recap';
const IDS: readonly string[] = ['add', 'nospend', 'recap'];

let loaded: QuickActions | null | undefined;

/** Loaded on first use so a missing or broken native module can only disable shortcuts, never block launch. */
async function load(): Promise<QuickActions | null> {
  if (loaded !== undefined) return loaded;
  try {
    loaded = await import('expo-quick-actions');
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Long-press the app icon: three jumps straight to the things done every day. */
export async function registerShortcuts(): Promise<void> {
  const Q = await load();
  if (!Q) return;
  try {
    await Q.setItems([
      { id: 'add', title: 'Log a spend', icon: 'add' },
      { id: 'nospend', title: 'Spent nothing today', icon: 'check' },
      { id: 'recap', title: 'Weekly recap', icon: 'recap' },
    ]);
  } catch {
    // shortcuts are a convenience; ignore platforms that refuse them
  }
}

const asId = (v: unknown): ShortcutId | null => (typeof v === 'string' && IDS.includes(v) ? (v as ShortcutId) : null);

/**
 * Calls `handler` for the shortcut that launched the app (if any) and for later taps while it runs.
 * Only ids we registered are honoured.
 */
export function onShortcut(handler: (id: ShortcutId) => void): () => void {
  let cancelled = false;
  let remove: (() => void) | null = null;
  void load().then((Q) => {
    if (!Q || cancelled) return;
    const first = asId(Q.initial?.id);
    if (first) handler(first);
    const sub = Q.addListener((a) => {
      const id = asId(a.id);
      if (id) handler(id);
    });
    remove = () => sub.remove();
  });
  return () => {
    cancelled = true;
    remove?.();
  };
}
