"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createCartDraftStore, type CartDraft } from "@/lib/cart-draft";

export function useCartDraft(scope: string | null) {
  const store = useMemo(() => createCartDraftStore(scope), [scope]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const setters = useMemo(() => {
    const setter = <K extends keyof CartDraft>(field: K) => (value: CartDraft[K] | ((current: CartDraft[K]) => CartDraft[K])) => store.setField(field, value);
    return { setDraft: setter("quantities"), setDraftAmounts: setter("amounts"), setMissingProductsNote: setter("note"), setDraftWalletScope: setter("walletScope"), setEditingCartId: setter("editingCartId") };
  }, [store]);
  useEffect(() => {
    try { store.connect(window.localStorage); } catch { store.connect(null); }
    const refresh = (event: StorageEvent) => { if (event.key === store.key) store.refresh(); };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [store]);
  return { ...snapshot, ...setters, store };
}
