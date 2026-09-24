export type CartDraft = {
  quantities: Record<number, number>;
  amounts: Record<number, number>;
  note: string;
  walletScope: "family" | "personal";
  editingCartId: number | null;
};
type StoredDrafts = { version: 1; active: CartDraft; saved: CartDraft[] };
type DraftStorage = Pick<Storage, "getItem" | "setItem">;
type Snapshot = StoredDrafts & { ready: boolean; storageError: boolean; submitting: boolean };

export const emptyCartDraft = (): CartDraft => ({ quantities: {}, amounts: {}, note: "", walletScope: "family", editingCartId: null });
export const hasCartDraft = (draft: CartDraft) => Boolean(Object.keys(draft.quantities).length || draft.note.trim() || draft.editingCartId);
const sameDraft = (a: CartDraft, b: CartDraft) => JSON.stringify(a) === JSON.stringify(b);
const initialSnapshot: Snapshot = { version: 1, active: emptyCartDraft(), saved: [], ready: false, storageError: false, submitting: false };

function parseDraft(value: unknown): CartDraft {
  if (!value || typeof value !== "object") throw new Error("Invalid draft");
  const draft = value as CartDraft;
  const numberMap = (map: unknown, maximum: number) => {
    if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("Invalid items");
    const entries = Object.entries(map);
    if (entries.some(([id, quantity]) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > maximum)) throw new Error("Invalid quantity");
    return Object.fromEntries(entries) as Record<number, number>;
  };
  const quantities = numberMap(draft.quantities, 1_000_000_000);
  const amounts = numberMap(draft.amounts, 10_000_000);
  if (Object.keys(amounts).some((id) => !(Number(id) in quantities))) throw new Error("Missing amount item");
  if (typeof draft.note !== "string" || draft.note.length > 500 || !["family", "personal"].includes(draft.walletScope)) throw new Error("Invalid draft details");
  if (draft.editingCartId !== null && (!Number.isSafeInteger(draft.editingCartId) || draft.editingCartId <= 0)) throw new Error("Invalid order");
  return { quantities, amounts, note: draft.note, walletScope: draft.walletScope, editingCartId: draft.editingCartId };
}

export function parseStoredDrafts(raw: string): StoredDrafts {
  const value = JSON.parse(raw) as StoredDrafts;
  if (value?.version !== 1 || !Array.isArray(value.saved)) throw new Error("Unsupported draft");
  return { version: 1, active: parseDraft(value.active), saved: value.saved.map(parseDraft) };
}

export function draftStorageKey(scope: string) {
  return `darnaflow:cart-drafts:v1:${scope}`;
}

function addSaved(saved: CartDraft[], draft: CartDraft) {
  return hasCartDraft(draft) && !saved.some((item) => sameDraft(item, draft)) ? [...saved, draft] : saved;
}

/** Synchronous writes protect the last keystroke even when navigation follows immediately. */
export function createCartDraftStore(scope: string | null) {
  const key = scope ? draftStorageKey(scope) : null;
  let storage: DraftStorage | null = null;
  let lastRaw: string | null = null;
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const persist = (active: CartDraft, saved = snapshot.saved) => {
    let next: Snapshot = { ...snapshot, active, saved };
    try {
      if (!storage || !key) throw new Error("Storage unavailable");
      const raw = storage.getItem(key);
      if (raw && raw !== lastRaw) {
        const external = parseStoredDrafts(raw);
        // Two tabs can write before receiving each other's storage event. Keep both versions.
        let combined = next.saved;
        for (const draft of external.saved) combined = addSaved(combined, draft);
        if (!sameDraft(external.active, snapshot.active)) combined = addSaved(combined, external.active);
        next = { ...next, saved: combined };
      }
      const encoded = JSON.stringify({ version: 1, active: next.active, saved: next.saved });
      storage.setItem(key, encoded);
      lastRaw = encoded;
      next.storageError = false;
    } catch {
      next.storageError = true;
    }
    publish(next);
  };
  return {
    key,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect(target: DraftStorage | null) {
      storage = target;
      if (snapshot.ready) return;
      try {
        if (!storage || !key) throw new Error("Storage unavailable");
        const raw = storage.getItem(key);
        const restored = raw ? parseStoredDrafts(raw) : initialSnapshot;
        lastRaw = raw;
        publish({ ...restored, ready: true, storageError: false, submitting: false });
      } catch {
        publish({ ...snapshot, ready: true, storageError: true });
      }
    },
    refresh() {
      if (!storage || !key || snapshot.submitting || snapshot.storageError) return;
      try {
        const raw = storage.getItem(key);
        if (raw === lastRaw) return;
        const restored = raw ? parseStoredDrafts(raw) : initialSnapshot;
        lastRaw = raw;
        publish({ ...restored, ready: true, storageError: false, submitting: false });
      } catch { publish({ ...snapshot, storageError: true }); }
    },
    setField<K extends keyof CartDraft>(field: K, value: CartDraft[K] | ((current: CartDraft[K]) => CartDraft[K])) {
      if (!snapshot.ready || snapshot.submitting) return;
      const next = typeof value === "function" ? value(snapshot.active[field]) : value;
      persist({ ...snapshot.active, [field]: next });
    },
    update(change: (current: CartDraft) => CartDraft) {
      if (!snapshot.ready || snapshot.submitting) return false;
      persist(change(snapshot.active));
      return true;
    },
    replace(next: CartDraft) {
      if (!snapshot.ready || snapshot.submitting) return;
      persist(next, sameDraft(next, snapshot.active) ? snapshot.saved : addSaved(snapshot.saved, snapshot.active));
    },
    restore(index: number) {
      if (snapshot.submitting || !snapshot.saved[index]) return;
      const selected = snapshot.saved[index];
      persist(selected, addSaved(snapshot.saved.filter((_, position) => position !== index), snapshot.active));
    },
    beginSubmission() {
      if (!snapshot.ready || snapshot.submitting) return null;
      publish({ ...snapshot, submitting: true });
      return snapshot.active;
    },
    finishSubmission(submitted: CartDraft, success: boolean) {
      publish({ ...snapshot, submitting: false });
      if (success && sameDraft(snapshot.active, submitted)) persist(emptyCartDraft());
      else this.refresh();
    },
    retry() { persist(snapshot.active); },
  };
}
