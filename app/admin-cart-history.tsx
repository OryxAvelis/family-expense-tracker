"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Product = { name_fr: string; name_ar: string; name_en: string; unit: string; package_size: string | null };
type Item = { id: number; quantity_hundredths: number; requested_unit_price_cents: number; actual_unit_price_cents: number; purchase_status: string; products: Product | Product[] };
type HistoryCart = { id: number; member_id: number; status: string; created_at: string; completed_at: string | null; missing_products_note: string; created_by: string | null; offline_purchase: boolean; wallet_scope: "family" | "personal"; service_fee_cents: number; family_users: { name: string } | { name: string }[]; cart_items: Item[] };
const copy = {
  fr: { title: "Historique des paniers", all: "Tous les membres", statuses: "Tous les statuts", pending: "En attente", ready: "Priorité définie", shopping: "Achat en cours", completed: "Terminé", cancelled: "Annulé", products: "Produits", delivery: "Livraison", total: "Total", estimate: "Total estimé", empty: "Aucun panier trouvé.", retry: "Réessayer", previous: "Précédent", next: "Suivant", by: "Créé par", recorded: "Achat enregistré par l’admin", member: "Commande du membre", bought: "Acheté", unbought: "Non acheté", requested: "Demandé", date: "Créé le", finished: "Terminé le", loading: "Chargement…" },
  en: { title: "Cart history", all: "All members", statuses: "All statuses", pending: "Pending", ready: "Priority assigned", shopping: "Shopping", completed: "Completed", cancelled: "Cancelled", products: "Products", delivery: "Delivery", total: "Total", estimate: "Estimated total", empty: "No carts found.", retry: "Retry", previous: "Previous", next: "Next", by: "Created by", recorded: "Purchase recorded by admin", member: "Member order", bought: "Bought", unbought: "Not bought", requested: "Requested", date: "Created", finished: "Completed", loading: "Loading…" },
  ar: { title: "سجل السلال", all: "جميع الأعضاء", statuses: "جميع الحالات", pending: "قيد الانتظار", ready: "تم تحديد الأولوية", shopping: "الشراء جارٍ", completed: "مكتملة", cancelled: "ملغاة", products: "المنتجات", delivery: "التوصيل", total: "المجموع", estimate: "المجموع التقريبي", empty: "لا توجد سلال.", retry: "إعادة المحاولة", previous: "السابق", next: "التالي", by: "أنشأها", recorded: "شراء سجله المسؤول", member: "طلب العضو", bought: "تم شراؤه", unbought: "لم يُشترَ", requested: "مطلوب", date: "تاريخ الإنشاء", finished: "تاريخ الإكمال", loading: "جارٍ التحميل…" },
};
const joined = <T,>(value: T | T[]): T => Array.isArray(value) ? value[0] : value;

export function AdminCartHistory({ language, members, money }: { language: "fr" | "en" | "ar"; members: Array<{ id: number; name: string }>; money: (cents: number) => string }) {
  const t = copy[language];
  const [memberId, setMemberId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ carts: HistoryCart[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/family/history?${new URLSearchParams({ page: String(page), memberId, status })}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { carts: HistoryCart[]; total: number; error?: string };
        if (!response.ok) throw new Error(payload.error);
        setResult(payload);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t.empty);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [memberId, status, page, retry, t.empty]);
  const date = (value: string) => new Date(value).toLocaleString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" });
  return <section className="space-y-4" aria-busy={loading}>
    <h2 className="text-xl font-semibold">{t.title}</h2>
    <div className="flex flex-wrap gap-3">
      <select aria-label={t.all} className="max-w-full rounded-xl border border-border bg-card p-3" value={memberId} onChange={(event) => { setMemberId(event.target.value); setPage(1); }}>
        <option value="">{t.all}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <select aria-label={t.statuses} className="max-w-full rounded-xl border border-border bg-card p-3" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="">{t.statuses}</option>{(["pending", "ready", "shopping", "completed", "cancelled"] as const).map((value) => <option key={value} value={value}>{t[value]}</option>)}
      </select>
    </div>
    {error ? <div role="alert">{error} <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>{t.retry}</Button></div> : loading ? <p role="status">{t.loading}</p> : <>
      {!result?.carts.length && <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{t.empty}</p>}
      {result?.carts.map((cart) => {
        const complete = cart.status === "completed";
        const lineTotal = (item: Item) => item.requested_unit_price_cents === 2147483647
          ? (complete ? item.actual_unit_price_cents : item.quantity_hundredths)
          : Math.round((complete ? item.actual_unit_price_cents : item.requested_unit_price_cents) * item.quantity_hundredths / 100);
        const subtotal = cart.cart_items.filter((item) => !complete || item.purchase_status === "bought").reduce((sum, item) => sum + lineTotal(item), 0);
        return <details key={cart.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <summary className="cursor-pointer space-y-2">
            <span className="font-semibold">{joined(cart.family_users).name} · #{cart.id}</span>
            <span className="ms-3 text-sm text-primary">{t[cart.status as "pending" | "ready" | "shopping" | "completed" | "cancelled"]}</span>
            <span className="block text-xs text-muted-foreground">{t.date}: {date(cart.created_at)}{cart.completed_at && ` · ${t.finished}: ${date(cart.completed_at)}`}</span>
            <span className="block text-sm">{complete ? t.total : t.estimate}: <strong>{money(subtotal + cart.service_fee_cents)}</strong></span>
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            {cart.created_by ? `${t.by}: ${cart.created_by}` : cart.offline_purchase ? t.recorded : t.member}
            {` · ${cart.wallet_scope === "family" ? (language === "ar" ? "محفظة العائلة" : language === "en" ? "Family Wallet" : "Cagnotte familiale") : (language === "ar" ? "محفظة شخصية" : language === "en" ? "Personal wallet" : "Portefeuille personnel")}`}
          </p>
          <ul className="space-y-2">{cart.cart_items.map((item) => {
            const product = joined(item.products);
            const amount = item.requested_unit_price_cents === 2147483647;
            return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3 text-sm">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{product[`name_${language}`] || product.name_fr}</p><p className="text-xs text-muted-foreground">{amount ? money(item.quantity_hundredths) : `${item.quantity_hundredths / 100} × ${product.package_size || product.unit}`} · {t[item.purchase_status as "bought" | "unbought" | "requested"]}</p></div>
              <strong>{complete && item.purchase_status !== "bought" ? "—" : money(lineTotal(item))}</strong>
            </li>;
          })}</ul>
          {cart.missing_products_note && <p className="mt-3 whitespace-pre-wrap text-sm">{cart.missing_products_note}</p>}
          <div className="mt-4 space-y-2 border-t pt-3 text-sm"><p className="flex justify-between gap-3"><span>{t.products}</span><span>{money(subtotal)}</span></p><p className="flex justify-between gap-3"><span>{t.delivery}</span><span>{money(cart.service_fee_cents)}</span></p><p className="flex justify-between gap-3 font-semibold"><span>{complete ? t.total : t.estimate}</span><span>{money(subtotal + cart.service_fee_cents)}</span></p></div>
        </details>;
      })}
    </>}
    <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)}>{t.previous}</Button><span className="text-sm">{page} / {Math.max(1, Math.ceil((result?.total ?? 0) / 20))}</span><Button variant="outline" disabled={loading || page * 20 >= (result?.total ?? 0)} onClick={() => setPage((value) => value + 1)}>{t.next}</Button></div>
  </section>;
}
