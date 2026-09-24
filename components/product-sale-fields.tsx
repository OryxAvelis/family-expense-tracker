import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SaleMode } from "@/lib/catalogue";

export type ProductSaleDraft = { saleMode: SaleMode; unit: string; packageSize: string };

const copy = {
  fr: { mode: "Vendu comment ?", piece: "À l’unité", pack: "Paquet fermé", bulk: "En vrac", size: "Contenu d’un paquet", example: "Ex. 500 g, 1 L, 6 × 125 g", unit: "Unité de mesure", kg: "Kilogramme", litre: "Litre", hint: "Le prix correspond à un paquet entier.", loose: "Prix pour 1 kg ou 1 L. Les quantités partielles et les achats par montant sont possibles.", single: "Prix pour un article. Quantités entières uniquement.", locked: "Unité et format conservés pour les commandes existantes. Créez un nouveau produit pour un autre format." },
  en: { mode: "Sold as", piece: "Single item", pack: "Sealed pack", bulk: "Loose goods", size: "Contents of one pack", example: "E.g. 500 g, 1 L, 6 × 125 g", unit: "Measurement unit", kg: "Kilogram", litre: "Litre", hint: "The price is for one whole pack.", loose: "Price per 1 kg or 1 L. Partial quantities and buying by amount are available.", single: "Price for one item. Whole quantities only.", locked: "Unit and pack size are preserved for existing orders. Create a new product for a different format." },
  ar: { mode: "طريقة البيع", piece: "بالقطعة", pack: "عبوة مغلقة", bulk: "بالوزن أو الحجم", size: "محتوى عبوة واحدة", example: "مثال: 500 g، 1 L، 6 × 125 g", unit: "وحدة القياس", kg: "كيلوغرام", litre: "لتر", hint: "السعر لعبوة كاملة واحدة.", loose: "السعر لكل كيلوغرام أو لتر. يمكن طلب كمية جزئية أو الشراء بمبلغ محدد.", single: "السعر لقطعة واحدة. الكميات الصحيحة فقط.", locked: "تُحفظ الوحدة وحجم العبوة للطلبات السابقة. أنشئ منتجاً جديداً لحجم مختلف." },
};

export function ProductSaleFields({ id, value, onChange, locked = false, language }: {
  id: string;
  value: ProductSaleDraft;
  onChange: (value: ProductSaleDraft) => void;
  locked?: boolean;
  language: keyof typeof copy;
}) {
  const t = copy[language];
  return <div className="grid gap-3 rounded-xl border border-border bg-muted/25 p-3">
    <div className="grid gap-2">
      <Label htmlFor={`${id}-mode`}>{t.mode}</Label>
      <Select disabled={locked} value={value.saleMode} onValueChange={(mode: SaleMode) => onChange({
        saleMode: mode, unit: mode === "bulk" ? "kg" : "pièce", packageSize: "",
      })}>
        <SelectTrigger id={`${id}-mode`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="piece">{t.piece}</SelectItem>
          <SelectItem value="pack">{t.pack}</SelectItem>
          <SelectItem value="bulk">{t.bulk}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {value.saleMode === "pack" && <div className="grid gap-2">
      <Label htmlFor={`${id}-size`}>{t.size}</Label>
      <Input id={`${id}-size`} required maxLength={80} disabled={locked} placeholder={t.example} value={value.packageSize} onChange={(event) => onChange({ ...value, packageSize: event.target.value })} />
    </div>}
    {value.saleMode === "bulk" && <div className="grid gap-2">
      <Label htmlFor={`${id}-unit`}>{t.unit}</Label>
      <Select disabled={locked} value={value.unit} onValueChange={(unit) => onChange({ ...value, unit })}>
        <SelectTrigger id={`${id}-unit`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="kg">{t.kg}</SelectItem><SelectItem value="L">{t.litre}</SelectItem></SelectContent>
      </Select>
    </div>}
    <p className="text-xs leading-5 text-muted-foreground">{value.saleMode === "pack" ? t.hint : value.saleMode === "bulk" ? t.loose : t.single}</p>
    {locked && <p className="text-xs leading-5 text-muted-foreground">{t.locked}</p>}
  </div>;
}
