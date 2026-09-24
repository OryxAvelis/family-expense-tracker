export type SaleProduct = {
  unit: string;
  package_size?: string | null;
  unit_price_cents?: number;
};

export type SaleMode = "piece" | "pack" | "bulk";

export function saleMode(product: SaleProduct): SaleMode {
  if (product.package_size?.trim()) return "pack";
  return product.unit === "kg" || product.unit === "L" ? "bulk" : "piece";
}

export function canPurchaseByAmount(product: SaleProduct) {
  return saleMode(product) === "bulk" && (product.unit_price_cents ?? 0) > 0;
}

export function quantityStep(product: SaleProduct) {
  return saleMode(product) === "bulk" ? 50 : 100;
}

export function validateOrderUnit(product: SaleProduct, quantity: number, amount?: number | null) {
  if (amount !== null && amount !== undefined) {
    if (!canPurchaseByAmount(product)) throw new Error("Seuls les produits en vrac peuvent être achetés par montant.");
  } else if (!Number.isSafeInteger(quantity) || quantity <= 0 || (saleMode(product) !== "bulk" && quantity % 100 !== 0)) {
    throw new Error("Choisissez un nombre entier de pièces ou de paquets.");
  }
}

const saleCopy = {
  fr: { piece: "À l’unité", pack: "Paquet", bulk: "En vrac", pieceUnit: "pièce" },
  en: { piece: "Per item", pack: "Pack", bulk: "Loose", pieceUnit: "item" },
  ar: { piece: "بالقطعة", pack: "عبوة", bulk: "بالوزن أو الحجم", pieceUnit: "قطعة" },
};

export function saleLabel(product: SaleProduct, language: keyof typeof saleCopy = "fr") {
  const copy = saleCopy[language];
  const mode = saleMode(product);
  if (mode === "pack") return `${copy.pack} · ${product.package_size?.trim()}`;
  if (mode === "bulk") return `${copy.bulk} · ${formatQuantity(100, product, language)}`;
  return copy.piece;
}

export function formatQuantity(quantity: number, product: SaleProduct, language: keyof typeof saleCopy = "fr") {
  const count = new Intl.NumberFormat(language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA", { maximumFractionDigits: 2 }).format(quantity / 100);
  if (saleMode(product) === "pack") return `${count} × ${product.package_size?.trim()}`;
  const unit = product.unit === "pièce" ? saleCopy[language].pieceUnit
    : language === "ar" ? product.unit === "kg" ? "كلغ" : "لتر" : product.unit;
  return `${count} ${unit}`;
}

export function parseProductSale(body: Record<string, unknown>, current?: SaleProduct) {
  if (body.packageSize !== undefined && body.packageSize !== null && typeof body.packageSize !== "string") {
    throw new Error("Le format du produit est invalide.");
  }
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const packageSize = body.packageSize === undefined ? current?.package_size?.trim() || null
    : typeof body.packageSize === "string" ? body.packageSize.trim().replace(/\s+/g, " ") || null : null;
  if (!["pièce", "kg", "L"].includes(unit) || (packageSize?.length ?? 0) > 80) {
    throw new Error("L’unité ou le format du produit est invalide.");
  }
  const result = { unit, package_size: packageSize };
  if (body.saleMode !== undefined && body.saleMode !== saleMode(result)) {
    throw new Error("Précisez le format du paquet ou choisissez une unité de vrac.");
  }
  return result;
}

export const MISCLASSIFIED_FOODS = ["Abzar", "Cannelle en poudre", "Poudre de gingembre", "Khamarat", "Sel Fin"];

/** Only extract sizes stated in the name; never infer contents from a photo or price. */
export function extractPackageSize(name: string) {
  const measured = name.match(/(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:ml|cl|l|kg|g|mg|pi[eè]ces?|pcs?|unit[eé]s?|sachets?|capsules?|rouleaux?|serviettes?)\b/i);
  if (measured) return measured[0].replace(/\s+/g, " ").trim();
  const count = name.match(/\b(capsules?|sachets?|rouleaux?)\s*[x×]\s*(\d+)\b/i);
  return count ? `${count[2]} ${count[1].toLowerCase()}` : null;
}

/** Product names take precedence over ambiguous supplier tags such as “maison”. */
export function inferCatalogCategory(name: string, metadata = "") {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const title = normalize(name);
  const text = `${title} ${normalize(metadata)}`;
  if (/\b(CAHIERS?|STYLOS?|CRAYONS?|SCOLAIRE|PAPETERIE|ECOLE|CLASSEURS?|CARTABLES?)\b/.test(text)) return "school";
  if (/\b(PHARMACIE|SANTE|VITAMINES?|PANSEMENTS?|PARAPHARMACIE|COMPLEMENTS?)\b/.test(text)) return "health";
  if (/\b(HYGIENE|BEAUTE|GEL DOUCHE|SHAMPOOING|DENTIFRICE|DEODORANT|COUCHES?|LINGETTES?|SAVON)\b/.test(text)) return "hygiene";
  if (/\b(ENTRETIEN|NETTOYAGE|LESSIVE|DETERGENT|JAVEL|VAISSELLE|ASSOUPLISSANT|NETTOYANT|DEGRAISSANT|EPONGES?|POUBELLES?)\b/.test(text)) return "cleaning";
  if (/\b(BOUGIES?|USTENSILES?|CASSEROLES?|POELE)\b/.test(title)) return "household";
  if (/\b(ABZAR|CANNELLE|CINNAMON|POIVRE|CUMIN|CURCUMA|GINGEMBRE|KHAMARAT|LEVURE|SEL FIN|EPICES?|LAIT|CREME FRAICHE|CREME LIQUIDE|RIZ|FARINE|PAIN|BISCUITS?|SUCRE|THE|CAFE|SAUCE)\b/.test(title)) return "food";
  if (/\b(BEBE|MATERNITE|CREME)\b/.test(text)) return "hygiene";
  if (/\b(MAISON|BRICOLAGE|JARDINAGE|ACCESSOIRES?|USTENSILES?|PILES?|ELECTRIQUE|BOUGIES?|BARBECUE|CASSEROLES?|POELE)\b/.test(text)) return "household";
  return "food";
}
