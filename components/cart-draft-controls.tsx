import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CartDraft } from "@/lib/cart-draft";

export const draftCopy = {
  fr: {
    saved: "Brouillon enregistré sur cet appareil.", resume: "Reprendre mon panier", savedList: "Brouillons mis de côté", savedHelp: "Ouvrez un brouillon. Votre panier actuel sera mis de côté à son tour.",
    storageError: "Le brouillon ne peut pas être enregistré sur cet appareil. Gardez cette page ouverte pour ne pas le perdre.", retry: "Réessayer", items: "articles", family: "Cagnotte familiale", personal: "Portefeuille personnel",
    replaceTitle: "Un panier est déjà en cours", replaceHelp: "Votre panier actuel sera conservé dans les brouillons mis de côté.", keep: "Garder mon panier", replace: "Mettre de côté et ouvrir",
    unavailable: "Ce produit n’est plus disponible. Retirez-le avant d’envoyer le panier.", remove: "Retirer le produit indisponible", editUnavailable: "Cette commande ne peut plus être modifiée. Votre brouillon est conservé.", asNew: "Préparer une nouvelle commande", cannotSubmit: "Vérifiez les articles indisponibles et la commande à modifier.",
  },
  en: {
    saved: "Draft saved on this device.", resume: "Resume my cart", savedList: "Saved drafts", savedHelp: "Open a draft. Your current cart will be saved separately.",
    storageError: "This device cannot save your draft. Keep this page open to avoid losing it.", retry: "Retry", items: "items", family: "Family wallet", personal: "Personal wallet",
    replaceTitle: "You already have an unfinished cart", replaceHelp: "Your current cart will remain available in Saved drafts.", keep: "Keep my cart", replace: "Save aside and open",
    unavailable: "This product is no longer available. Remove it before sending the cart.", remove: "Remove unavailable product", editUnavailable: "This order can no longer be edited. Your draft has been kept.", asNew: "Prepare a new order", cannotSubmit: "Check unavailable products and the order being edited.",
  },
  ar: {
    saved: "تم حفظ المسودة على هذا الجهاز.", resume: "متابعة سلتي", savedList: "المسودات المحفوظة", savedHelp: "افتح مسودة. سيتم حفظ سلتك الحالية بشكل منفصل.",
    storageError: "تعذّر حفظ المسودة على هذا الجهاز. أبقِ الصفحة مفتوحة حتى لا تفقدها.", retry: "إعادة المحاولة", items: "منتجات", family: "محفظة العائلة", personal: "المحفظة الشخصية",
    replaceTitle: "لديك سلة غير مكتملة", replaceHelp: "ستبقى سلتك الحالية متاحة ضمن المسودات المحفوظة.", keep: "الاحتفاظ بسلتي", replace: "حفظها وفتح السلة",
    unavailable: "هذا المنتج لم يعد متاحاً. احذفه قبل إرسال السلة.", remove: "حذف المنتج غير المتاح", editUnavailable: "لم يعد بالإمكان تعديل هذا الطلب. تم الاحتفاظ بمسودتك.", asNew: "تحضير طلب جديد", cannotSubmit: "تحقق من المنتجات غير المتاحة والطلب المراد تعديله.",
  },
};

export function CartDraftControls({ language, active, saved, storageError, disabled, onResume, onRestore, onRetry }: {
  language: keyof typeof draftCopy; active: boolean; saved: CartDraft[]; storageError: boolean; disabled: boolean;
  onResume: () => void; onRestore: (index: number) => void; onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = draftCopy[language];
  if (!active && !saved.length && !storageError) return null;
  return <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-3">
    <p className="text-sm" role={storageError ? "alert" : undefined}>{storageError ? t.storageError : active ? t.saved : t.savedList}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {active && <Button size="sm" variant="outline" disabled={disabled} onClick={onResume}>{t.resume}</Button>}
      {storageError && <Button size="sm" variant="outline" onClick={onRetry} disabled={disabled}>{t.retry}</Button>}
      {saved.length > 0 && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>{t.savedList} ({saved.length})</Button>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85svh] overflow-y-auto rounded-2xl" dir={language === "ar" ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle>{t.savedList}</DialogTitle><DialogDescription>{t.savedHelp}</DialogDescription></DialogHeader>
        {saved.map((draft, index) => <button key={index} type="button" disabled={disabled} onClick={() => { onRestore(index); setOpen(false); }} className="rounded-xl border border-border p-3 text-start hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
          <span className="block font-semibold">{Object.keys(draft.quantities).length} {t.items} · {draft.walletScope === "family" ? t.family : t.personal}</span>
          {draft.note && <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{draft.note}</span>}
        </button>)}
      </DialogContent>
    </Dialog>
  </div>;
}
