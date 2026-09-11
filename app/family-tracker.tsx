"use client";

import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Languages,
  ListChecks,
  Loader2,
  LogOut,
  Moon,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  UserCog,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  BarcodeScannerDialog,
  type ScannedCatalogProduct,
} from "@/app/barcode-scanner-dialog";
import { useFamilyTheme } from "@/hooks/use-family-theme";
import type { FamilySessionUser } from "@/lib/family-auth";

type Language = "fr" | "ar" | "en";
type Role = "member" | "admin" | "delivery";
type CatalogSource = "family" | "carrefour";
type CartStatus = "pending" | "ready" | "shopping" | "completed";
type Priority = "urgent" | "normal" | null;
type PurchaseStatus = "requested" | "bought" | "unbought";

type FamilyUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  initials: string;
};

type Product = {
  id: number;
  name_fr: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit: "L" | "kg" | "pièce";
  unit_price_cents: number;
  image_position: string;
  image_url: string | null;
  barcode: string | null;
  package_size: string | null;
  external_source?: string | null;
  external_id?: string | null;
  purchase_count: number;
};

type CarrefourProduct = {
  external_id: string;
  name: string;
  category: Product["category"];
  image_url: string | null;
  price_cents: number;
  crossed_price_cents: number | null;
  package_size: string | null;
  store: string;
};

type Cart = {
  id: number;
  member_id: number;
  member_name: string;
  member_initials: string;
  status: CartStatus;
  priority: Priority;
  created_at: string;
  submitted_at: string;
  approved_at: string | null;
  completed_at: string | null;
};

type CartItem = {
  id: number;
  cart_id: number;
  product_id: number;
  quantity_hundredths: number;
  requested_unit_price_cents: number;
  actual_unit_price_cents: number;
  purchase_status: PurchaseStatus;
  name_fr: string;
  name_ar: string;
  name_en: string;
  unit: Product["unit"];
  image_position: string;
  image_url: string | null;
  package_size: string | null;
};

type MonthlyTotal = {
  month: string;
  total_cents: number;
  carts_count: number;
};

type AppData = {
  users: FamilyUser[];
  products: Product[];
  carts: Cart[];
  items: CartItem[];
  monthlyTotals: MonthlyTotal[];
};

const words = {
  fr: {
    brand: "Dépenses famille",
    catalog: "Catalogue",
    carts: "Mes paniers",
    hello: "Bonjour",
    question: "De quoi la maison a-t-elle besoin aujourd’hui ?",
    search: "Rechercher lait, pain, farine…",
    essentials: "Produits essentiels",
    estimated: "Prix actuel — modifiable par le livreur",
    cart: "Panier",
    emptyCart: "Votre panier est vide.",
    submit: "Envoyer la commande",
    update: "Mettre à jour le panier",
    estimate: "Total estimé",
    pending: "Visible par l’admin et le livreur",
    ready: "Priorité définie",
    shopping: "Achat en cours",
    completed: "Terminé",
    edit: "Modifier",
    cancel: "Annuler",
    result: "Résultat récent",
    bought: "Acheté",
    unbought: "Non acheté",
    admin: "Administration",
    requests: "Demandes",
    products: "Produits",
    analytics: "Analyse",
    awaiting: "Paniers à classer",
    choosePriority: "Déjà visible par le livreur — choisissez simplement sa priorité.",
    urgent: "Urgent",
    normal: "Normal",
    noRequests: "Aucune demande en attente.",
    price: "Prix unitaire",
    save: "Enregistrer",
    addProduct: "Ajouter un produit",
    monthlyTotal: "Total dépensé ce mois",
    boughtOnly: "Uniquement les produits achetés",
    delivery: "Livraison",
    queue: "File d’achats",
    history: "Historique",
    finish: "Terminer ce panier",
    next: "Autres paniers",
    openCart: "Ouvrir le panier de",
    noQueue: "Aucun panier à acheter.",
    notifications: "Notifications",
    rolePreview: "Aperçu du rôle",
    member: "Membre",
    items: "articles",
    all: "Tout",
    food: "Alimentation",
    cleaning: "Nettoyage",
    hygiene: "Hygiène",
    school: "École",
    household: "Maison",
    health: "Santé",
    quantity: "Quantité",
    activeLimit: "3 paniers actifs maximum",
    loading: "Chargement de la maison…",
    retry: "Réessayer",
    lightMode: "Activer le mode clair",
    darkMode: "Activer le mode sombre",
    logout: "Se déconnecter",
    newOrder: "Nouvelle",
    scanProduct: "Scanner un produit",
    priceToConfirm: "Prix à confirmer",
    scannedAdded: "Produit scanné ajouté au panier.",
    familyCatalog: "Catalogue maison",
    carrefourCatalog: "Catalogue Carrefour",
    carrefourHint: "Prix Carrefour en ligne — Salma confirme le prix réel.",
    carrefourRules: "Maximum 500 DH · appareils électriques exclus",
    carrefourLoading: "Chargement du catalogue Carrefour…",
    carrefourAdded: "Produit Carrefour ajouté au panier.",
    promotion: "Promo",
    loadMore: "Afficher plus",
    noProducts: "Aucun produit trouvé.",
  },
  ar: {
    brand: "مصاريف العائلة",
    catalog: "المنتجات",
    carts: "سلّاتي",
    hello: "مرحبا",
    question: "ماذا يحتاج البيت اليوم؟",
    search: "ابحث عن الحليب أو الخبز أو الدقيق…",
    essentials: "المنتجات الأساسية",
    estimated: "السعر الحالي — يمكن للمكلّف بالشراء تعديله",
    cart: "السلة",
    emptyCart: "سلّتك فارغة.",
    submit: "إرسال الطلب",
    update: "تحديث السلة",
    estimate: "المجموع التقريبي",
    pending: "ظاهرة للمسؤول والمكلّف بالشراء",
    ready: "تم تحديد الأولوية",
    shopping: "الشراء جارٍ",
    completed: "مكتملة",
    edit: "تعديل",
    cancel: "إلغاء",
    result: "آخر نتيجة",
    bought: "تم شراؤه",
    unbought: "لم يُشترَ",
    admin: "الإدارة",
    requests: "الطلبات",
    products: "المنتجات",
    analytics: "التحليل",
    awaiting: "سلال تنتظر التصنيف",
    choosePriority: "السلة ظاهرة بالفعل للمكلّف بالشراء — حدّد فقط أولويتها.",
    urgent: "مستعجل",
    normal: "عادي",
    noRequests: "لا توجد طلبات منتظرة.",
    price: "ثمن الوحدة",
    save: "حفظ",
    addProduct: "إضافة منتج",
    monthlyTotal: "مجموع مصاريف هذا الشهر",
    boughtOnly: "المنتجات التي تم شراؤها فقط",
    delivery: "المشتريات",
    queue: "قائمة الشراء",
    history: "السجل",
    finish: "إنهاء هذه السلة",
    next: "سلال أخرى",
    openCart: "فتح سلة",
    noQueue: "لا توجد سلة للشراء.",
    notifications: "الإشعارات",
    rolePreview: "معاينة الدور",
    member: "فرد من العائلة",
    items: "منتجات",
    all: "الكل",
    food: "مواد غذائية",
    cleaning: "التنظيف",
    hygiene: "النظافة",
    school: "المدرسة",
    household: "المنزل",
    health: "الصحة",
    quantity: "الكمية",
    activeLimit: "3 سلال نشطة كحد أقصى",
    loading: "جارٍ تحميل بيانات البيت…",
    retry: "إعادة المحاولة",
    lightMode: "تفعيل الوضع الفاتح",
    darkMode: "تفعيل الوضع الداكن",
    logout: "تسجيل الخروج",
    newOrder: "جديدة",
    scanProduct: "مسح منتج",
    priceToConfirm: "السعر يحتاج إلى تأكيد",
    scannedAdded: "تمت إضافة المنتج إلى السلة.",
    familyCatalog: "منتجات البيت",
    carrefourCatalog: "منتجات كارفور",
    carrefourHint: "ثمن كارفور على الإنترنت — سلمى تؤكد الثمن الحقيقي.",
    carrefourRules: "500 درهم كحد أقصى · الأجهزة الكهربائية مستثناة",
    carrefourLoading: "جارٍ تحميل منتجات كارفور…",
    carrefourAdded: "تمت إضافة منتج كارفور إلى السلة.",
    promotion: "تخفيض",
    loadMore: "عرض المزيد",
    noProducts: "لم يتم العثور على أي منتج.",
  },
  en: {
    brand: "Family expenses",
    catalog: "Catalog",
    carts: "My carts",
    hello: "Hello",
    question: "What does the household need today?",
    search: "Search milk, bread, flour…",
    essentials: "Essential products",
    estimated: "Current price — editable by the buyer",
    cart: "Cart",
    emptyCart: "Your cart is empty.",
    submit: "Send order",
    update: "Update cart",
    estimate: "Estimated total",
    pending: "Visible to admin and buyer",
    ready: "Priority assigned",
    shopping: "Shopping in progress",
    completed: "Completed",
    edit: "Edit",
    cancel: "Cancel",
    result: "Recent result",
    bought: "Bought",
    unbought: "Not bought",
    admin: "Administration",
    requests: "Requests",
    products: "Products",
    analytics: "Analytics",
    awaiting: "Carts to prioritize",
    choosePriority: "Already visible to the buyer — just set its priority.",
    urgent: "Urgent",
    normal: "Normal",
    noRequests: "No requests are waiting.",
    price: "Unit price",
    save: "Save",
    addProduct: "Add product",
    monthlyTotal: "Total spent this month",
    boughtOnly: "Bought products only",
    delivery: "Purchasing",
    queue: "Shopping queue",
    history: "History",
    finish: "Finish this cart",
    next: "Other carts",
    openCart: "Open cart from",
    noQueue: "No cart to purchase.",
    notifications: "Notifications",
    rolePreview: "Role preview",
    member: "Family member",
    items: "items",
    all: "All",
    food: "Food",
    cleaning: "Cleaning",
    hygiene: "Hygiene",
    school: "School",
    household: "Household",
    health: "Health",
    quantity: "Quantity",
    activeLimit: "Maximum 3 active carts",
    loading: "Loading the household…",
    retry: "Retry",
    lightMode: "Turn on light mode",
    darkMode: "Turn on dark mode",
    logout: "Sign out",
    newOrder: "New",
    scanProduct: "Scan a product",
    priceToConfirm: "Price to confirm",
    scannedAdded: "Scanned product added to the cart.",
    familyCatalog: "House catalog",
    carrefourCatalog: "Carrefour catalog",
    carrefourHint: "Online Carrefour price — Salma confirms the real price.",
    carrefourRules: "Maximum 500 DH · electrical products excluded",
    carrefourLoading: "Loading the Carrefour catalog…",
    carrefourAdded: "Carrefour product added to the cart.",
    promotion: "Promo",
    loadMore: "Show more",
    noProducts: "No products found.",
  },
} as const;

const languageNames: Record<Language, string> = {
  fr: "Français",
  ar: "العربية",
  en: "English",
};

const roleNames: Record<Role, Record<Language, string>> = {
  member: { fr: "Membre", ar: "فرد", en: "Member" },
  admin: { fr: "Admin", ar: "مسؤول", en: "Admin" },
  delivery: { fr: "Livreur", ar: "المكلّف بالشراء", en: "Buyer" },
};

const categoryKeys = ["all", "food", "cleaning", "hygiene", "school", "household", "health"] as const;

function ProductImage({
  position,
  name,
  imageUrl,
  className = "",
}: {
  position: string;
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  let safeRemoteImage: string | null = null;
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      const isCarrefourStorage =
        parsed.hostname === "storage.googleapis.com" &&
        parsed.pathname.startsWith("/crftobringo-sharing-ma-prelive/");
      const isCarrefourHost =
        parsed.hostname === "backend.carrefour.ma" || parsed.hostname === "assets.carrefour.ma";
      if (
        parsed.protocol === "https:" &&
        (parsed.hostname === "openfoodfacts.org" ||
          parsed.hostname.endsWith(".openfoodfacts.org") ||
          isCarrefourStorage ||
          isCarrefourHost)
      ) {
        safeRemoteImage = parsed.toString();
      }
    } catch {
      safeRemoteImage = null;
    }
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={`bg-center bg-no-repeat ${safeRemoteImage ? "bg-white" : ""} ${className}`}
      style={{
        backgroundImage: safeRemoteImage
          ? `url("${safeRemoteImage}")`
          : "url('/product-sprite.png')",
        backgroundPosition: safeRemoteImage ? "center" : position,
        backgroundSize: safeRemoteImage ? "contain" : "200% 200%",
      }}
    />
  );
}

export function FamilyTracker({
  role,
  currentUser,
}: {
  role: Role;
  currentUser: FamilySessionUser;
}) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<Language>("fr");
  const [memberId] = useState(currentUser.id);
  const [memberView, setMemberView] = useState<"catalog" | "carts">("catalog");
  const [deliveryView, setDeliveryView] = useState<"queue" | "history">("queue");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [editingCartId, setEditingCartId] = useState<number | null>(null);
  const [deliveryPrices, setDeliveryPrices] = useState<Record<number, string>>({});
  const [productPrices, setProductPrices] = useState<Record<number, string>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("family");
  const [carrefourProducts, setCarrefourProducts] = useState<CarrefourProduct[]>([]);
  const [carrefourLoading, setCarrefourLoading] = useState(false);
  const [carrefourLoaded, setCarrefourLoaded] = useState(false);
  const [carrefourError, setCarrefourError] = useState("");
  const [carrefourVisible, setCarrefourVisible] = useState(24);
  const [carrefourBusyId, setCarrefourBusyId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    nameFr: "",
    nameAr: "",
    nameEn: "",
    category: "food",
    unit: "pièce",
    price: "",
  });
  const { theme, toggleTheme } = useFamilyTheme();

  const t = words[language];

  const applyData = useCallback((payload: AppData) => {
    setData(payload);
    setDeliveryPrices(
      Object.fromEntries(payload.items.map((item) => [item.id, (item.actual_unit_price_cents / 100).toFixed(2)])),
    );
    setProductPrices(
      Object.fromEntries(payload.products.map((product) => [product.id, (product.unit_price_cents / 100).toFixed(2)])),
    );
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoadError("");
      const response = await fetch("/api/family", { cache: "no-store" });
      const payload = (await response.json()) as AppData & { error?: string };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les données.");
      applyData(payload);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Impossible de charger les données.");
    }
  }, [applyData]);

  const loadCarrefourCatalogue = useCallback(async () => {
    try {
      setCarrefourLoading(true);
      setCarrefourError("");
      const response = await fetch("/api/products/carrefour", { cache: "no-store" });
      const payload = (await response.json()) as {
        products?: CarrefourProduct[];
        error?: string;
      };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok || !Array.isArray(payload.products)) {
        throw new Error(payload.error || "Catalogue Carrefour indisponible.");
      }
      setCarrefourProducts(payload.products);
      setCarrefourLoaded(true);
    } catch (error) {
      setCarrefourError(
        error instanceof Error ? error.message : "Catalogue Carrefour indisponible.",
      );
    } finally {
      setCarrefourLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  useEffect(() => {
    if (role !== "member" || catalogSource !== "carrefour" || carrefourLoaded) return;
    const initialLoad = window.setTimeout(() => void loadCarrefourCatalogue(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [carrefourLoaded, catalogSource, loadCarrefourCatalogue, role]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    const interval = window.setInterval(refreshWhenVisible, 8_000);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadData]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const act = async (body: Record<string, unknown>, success: string) => {
    try {
      setBusy(true);
      const response = await fetch("/api/family", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as AppData & { error?: string };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return false;
      }
      if (!response.ok) throw new Error(payload.error || "Action impossible.");
      applyData(payload);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const productName = useCallback(
    (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) =>
      language === "ar"
        ? product.name_ar || product.name_fr
        : language === "en"
          ? product.name_en || product.name_fr
          : product.name_fr,
    [language],
  );

  const addScannedProduct = useCallback(
    (product: ScannedCatalogProduct) => {
      setData((current) =>
        current
          ? {
              ...current,
              products: [product, ...current.products.filter((entry) => entry.id !== product.id)],
            }
          : current,
      );
      setProductPrices((current) => ({
        ...current,
        [product.id]: (product.unit_price_cents / 100).toFixed(2),
      }));
      setDraft((current) => ({
        ...current,
        [product.id]: (current[product.id] ?? 0) + 100,
      }));
      toast.success(t.scannedAdded);
    },
    [t.scannedAdded],
  );

  const addCarrefourProduct = useCallback(
    async (source: CarrefourProduct) => {
      try {
        setCarrefourBusyId(source.external_id);
        const response = await fetch("/api/products/carrefour", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ externalId: source.external_id }),
        });
        const payload = (await response.json()) as { product?: Product; error?: string };
        if (response.status === 401) {
          window.location.replace("/connexion");
          return;
        }
        if (!response.ok || !payload.product) {
          throw new Error(payload.error || "Import Carrefour impossible.");
        }

        const product = payload.product;
        setData((current) =>
          current
            ? {
                ...current,
                products: [product, ...current.products.filter((entry) => entry.id !== product.id)],
              }
            : current,
        );
        setProductPrices((current) => ({
          ...current,
          [product.id]: (product.unit_price_cents / 100).toFixed(2),
        }));
        setDraft((current) => ({
          ...current,
          [product.id]: (current[product.id] ?? 0) + 100,
        }));
        toast.success(t.carrefourAdded);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import Carrefour impossible.");
      } finally {
        setCarrefourBusyId(null);
      }
    },
    [t.carrefourAdded],
  );

  const money = (cents: number) => {
    const locale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} ${language === "ar" ? "د.م." : "DH"}`;
  };

  const quantityLabel = (hundredths: number, unit: Product["unit"]) => {
    const amount = hundredths / 100;
    const translatedUnit =
      language === "ar"
        ? ({ L: "لتر", kg: "كلغ", "pièce": "قطعة" } as const)[unit]
        : language === "en"
          ? ({ L: "L", kg: "kg", "pièce": "piece" } as const)[unit]
          : unit;
    return `${new Intl.NumberFormat(language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA", { maximumFractionDigits: 2 }).format(amount)} ${translatedUnit}`;
  };

  const itemsFor = (cartId: number) => data?.items.filter((item) => item.cart_id === cartId) ?? [];
  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLocaleLowerCase();
    return data.products.filter((product) => {
      const categoryMatch = category === "all" || product.category === category;
      const textMatch =
        !needle ||
        [product.name_fr, product.name_ar, product.name_en]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return categoryMatch && textMatch;
    });
  }, [category, data, search]);

  const filteredCarrefourProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return carrefourProducts.filter((product) => {
      const categoryMatch = category === "all" || product.category === category;
      const textMatch = !needle || product.name.toLocaleLowerCase().includes(needle);
      return categoryMatch && textMatch;
    });
  }, [carrefourProducts, category, search]);

  const visibleCarrefourProducts = filteredCarrefourProducts.slice(0, carrefourVisible);

  const draftProducts = Object.entries(draft)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({
      product: data?.products.find((product) => product.id === Number(id)),
      quantity,
    }))
    .filter((entry): entry is { product: Product; quantity: number } => Boolean(entry.product));

  const draftTotal = draftProducts.reduce(
    (sum, entry) => sum + Math.round((entry.product.unit_price_cents * entry.quantity) / 100),
    0,
  );

  useEffect(() => {
    type ToolDefinition = {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    };
    type ModelContext = {
      registerTool: (
        tool: ToolDefinition,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };

    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool || !data || role !== "member") return;

    const lifecycle = new AbortController();
    const afterPaint = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const register = (tool: ToolDefinition) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        // WebMCP is optional and must never block the visible experience.
      }
    };

    register({
      name: "search_household_catalog",
      title: "Search household catalog",
      description: "Find available household products by name or category without changing the cart.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: {
            type: "string",
            enum: ["all", "food", "cleaning", "hygiene", "school", "household", "health"],
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input) {
        const value = (input ?? {}) as { query?: string; category?: string };
        if (value.query !== undefined && typeof value.query !== "string") {
          throw new Error("query must be a string.");
        }
        const allowedCategories = ["all", "food", "cleaning", "hygiene", "school", "household", "health"];
        if (value.category !== undefined && !allowedCategories.includes(value.category)) {
          throw new Error("category is invalid.");
        }
        const query = (value.query ?? "").trim().toLocaleLowerCase();
        const requestedCategory = value.category ?? "all";
        return {
          products: data.products
            .filter(
              (product) =>
                (requestedCategory === "all" || product.category === requestedCategory) &&
                (!query ||
                  [product.name_fr, product.name_ar, product.name_en]
                    .join(" ")
                    .toLocaleLowerCase()
                    .includes(query)),
            )
            .slice(0, 12)
            .map((product) => ({
              id: product.id,
              name: productName(product),
              category: product.category,
              unit: product.unit,
              unitPriceCents: product.unit_price_cents,
            })),
        };
      },
    });

    register({
      name: "stage_household_cart",
      title: "Stage household cart",
      description: "Add or replace products in the visible draft cart. This does not submit the cart.",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              properties: {
                productId: { type: "integer", minimum: 1 },
                quantityHundredths: { type: "integer", minimum: 1, maximum: 10000 },
              },
              required: ["productId", "quantityHundredths"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const value = input as {
          items?: Array<{ productId?: number; quantityHundredths?: number }>;
        };
        if (!Array.isArray(value.items) || !value.items.length) {
          throw new Error("At least one cart item is required.");
        }
        const next: Record<number, number> = {};
        for (const item of value.items) {
          if (
            !Number.isInteger(item.productId) ||
            !Number.isInteger(item.quantityHundredths) ||
            !data.products.some((product) => product.id === item.productId)
          ) {
            throw new Error("A cart item is invalid.");
          }
          next[item.productId!] = item.quantityHundredths!;
        }
        setDraft(next);
        setEditingCartId(null);
        setCartOpen(true);
        await afterPaint();
        return { stagedItems: Object.keys(next).length, status: "draft" };
      },
    });

    register({
      name: "submit_household_cart",
      title: "Submit household cart",
      description: "Submit the currently staged cart so it appears immediately for both the administrator and buyer.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (
          input !== undefined &&
          input !== null &&
          (typeof input !== "object" || Array.isArray(input) || Object.keys(input as object).length > 0)
        ) {
          throw new Error("This tool does not accept input fields.");
        }
        const staged = Object.entries(draft)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId, quantityHundredths]) => ({
            productId: Number(productId),
            quantityHundredths,
          }));
        if (!staged.length) throw new Error("The visible cart is empty.");
        const response = await fetch("/api/family", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "submit_cart",
            actorRole: "member",
            memberId: currentUser.id,
            items: staged,
          }),
        });
        const payload = (await response.json()) as AppData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "The cart could not be submitted.");
        applyData(payload);
        setDraft({});
        setCartOpen(false);
        setMemberView("carts");
        await afterPaint();
        return { status: "visible_to_admin_and_delivery", memberId: currentUser.id, itemCount: staged.length };
      },
    });

    return () => lifecycle.abort();
  }, [applyData, currentUser.id, data, draft, productName, role]);

  const addToCart = (product: Product) => {
    setDraft((current) => ({
      ...current,
      [product.id]: (current[product.id] ?? 0) + 100,
    }));
    toast.success(`${productName(product)} · +1 ${product.unit}`);
  };

  const changeQuantity = (product: Product, direction: 1 | -1) => {
    const step = product.unit === "pièce" ? 100 : 50;
    setDraft((current) => {
      const next = Math.max(0, (current[product.id] ?? 0) + direction * step);
      const updated = { ...current, [product.id]: next };
      if (!next) delete updated[product.id];
      return updated;
    });
  };

  const submitCart = async () => {
    if (!draftProducts.length) return;
    const payload = {
      action: editingCartId ? "update_cart" : "submit_cart",
      actorRole: "member",
      memberId: currentUser.id,
      ...(editingCartId ? { cartId: editingCartId } : {}),
      items: draftProducts.map(({ product, quantity }) => ({
        productId: product.id,
        quantityHundredths: quantity,
      })),
    };
    const ok = await act(payload, editingCartId ? "Panier mis à jour." : "Commande visible par l’admin et le livreur.");
    if (ok) {
      setDraft({});
      setEditingCartId(null);
      setCartOpen(false);
      setMemberView("carts");
    }
  };

  const editCart = (cart: Cart) => {
    setDraft(
      Object.fromEntries(itemsFor(cart.id).map((item) => [item.product_id, item.quantity_hundredths])),
    );
    setEditingCartId(cart.id);
    setCartOpen(true);
  };

  const parsePrice = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
  const pendingCarts =
    data?.carts.filter(
      (cart) => cart.priority === null && ["pending", "ready", "shopping"].includes(cart.status),
    ) ?? [];
  const deliveryQueue =
    data?.carts.filter((cart) => ["pending", "ready", "shopping"].includes(cart.status)) ?? [];
  const deliveryHistory =
    data?.carts.filter((cart) => cart.status === "completed").slice().reverse() ?? [];
  const memberActive =
    data?.carts.filter(
      (cart) =>
        cart.member_id === memberId &&
        ["pending", "ready", "shopping"].includes(cart.status),
    ) ?? [];
  const latestMemberResult =
    data?.carts
      .filter((cart) => cart.member_id === memberId && cart.status === "completed")
      .slice()
      .reverse()[0] ?? null;

  const notificationCount =
    role === "admin"
      ? pendingCarts.length
      : role === "delivery"
        ? deliveryQueue.length
        : memberActive.filter((cart) => cart.status !== "pending").length;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthlyTotal =
    data?.monthlyTotals.find((entry) => entry.month === currentMonth)?.total_cents ?? 0;

  if (!data && !loadError) {
    return (
      <main className="min-h-screen bg-background p-5 text-foreground sm:p-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex items-center justify-between">
            <Skeleton className="h-12 w-48 rounded-2xl" />
            <Skeleton className="size-11 rounded-2xl" />
          </div>
          <Skeleton className="mb-4 h-10 w-3/4 max-w-xl rounded-xl" />
          <Skeleton className="mb-8 h-14 w-full max-w-2xl rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="aspect-[0.78] rounded-[1.4rem]" />
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t.loading}
          </p>
        </div>
      </main>
    );
  }

  if (loadError || !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-3xl border border-destructive/25 bg-card p-7 text-center">
          <AlertTriangle className="mx-auto mb-4 size-9 text-destructive" />
          <h1 className="text-xl font-semibold">Connexion impossible</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-6 rounded-xl" onClick={() => void loadData()}>
            {t.retry}
          </Button>
        </div>
      </main>
    );
  }

  const statusText: Record<CartStatus, string> = {
    pending: t.pending,
    ready: t.ready,
    shopping: t.shopping,
    completed: t.completed,
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster theme={theme} position="top-center" richColors />

      <aside className="fixed inset-y-0 start-0 z-30 hidden w-24 flex-col items-center border-e border-sidebar-border bg-sidebar/95 py-7 text-sidebar-foreground backdrop-blur-xl lg:flex">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-[0_10px_30px_rgba(64,224,177,0.2)]">
          D
        </div>
        <div className="mt-12 flex flex-1 flex-col items-center gap-3">
          {role === "member" && (
            <>
              <Button
                size="icon-lg"
                variant={memberView === "catalog" ? "default" : "ghost"}
                className="rounded-2xl"
                onClick={() => setMemberView("catalog")}
                aria-label={t.catalog}
              >
                <ShoppingBasket />
              </Button>
              <Button
                size="icon-lg"
                variant={memberView === "carts" ? "default" : "ghost"}
                className="rounded-2xl"
                onClick={() => setMemberView("carts")}
                aria-label={t.carts}
              >
                <ListChecks />
              </Button>
            </>
          )}
          {role === "admin" && <UserCog className="mt-3 size-6 text-primary" />}
          {role === "delivery" && <PackageCheck className="mt-3 size-6 text-primary" />}
        </div>
        <div className="grid size-10 place-items-center rounded-2xl bg-sidebar-accent text-sm font-bold text-sidebar-primary">
          {currentUser.initials}
        </div>
      </aside>

      <div className="min-h-screen pb-24 lg:ps-24 lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-background/88 px-4 py-3 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary font-black text-primary-foreground lg:hidden">
                D
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t.brand}</p>
                <p className="truncate text-sm text-muted-foreground">{roleNames[role][language]}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon-lg"
                variant="ghost"
                className="rounded-xl border border-border bg-card/70"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? t.lightMode : t.darkMode}
                title={theme === "dark" ? t.lightMode : t.darkMode}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>

              <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                <SelectTrigger aria-label="Langue" className="h-10 w-12 rounded-xl border-border bg-card/70 px-3 sm:w-[7.2rem]">
                  <Languages className="size-4" />
                  <span className="hidden sm:inline"><SelectValue /></span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(languageNames) as Language[]).map((key) => (
                    <SelectItem key={key} value={key}>{languageNames[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon-lg"
                    variant="ghost"
                    className="relative rounded-xl border border-border bg-card/70"
                    aria-label={t.notifications}
                  >
                    <Bell />
                    {notificationCount > 0 && (
                      <span className="absolute end-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-[#ffb454] text-[9px] font-black text-[#24180b]">
                        {notificationCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-2xl border-border bg-card p-4">
                  <p className="font-semibold">{t.notifications}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {role === "admin" && `${pendingCarts.length} ${t.awaiting.toLocaleLowerCase()}.`}
                    {role === "delivery" && `${deliveryQueue.length} ${t.carts.toLocaleLowerCase()}.`}
                    {role === "member" && `${notificationCount} ${t.carts.toLocaleLowerCase()} mis à jour.`}
                  </p>
                </PopoverContent>
              </Popover>

              <Button
                size="icon-lg"
                variant="ghost"
                className="rounded-xl border border-border bg-card/70"
                onClick={() => {
                  void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                    window.location.assign("/connexion");
                  });
                }}
                aria-label={t.logout}
                title={t.logout}
              >
                <LogOut />
              </Button>

              {role === "member" && (
                <Button
                  className="h-10 rounded-xl px-3"
                  onClick={() => setCartOpen(true)}
                  aria-label={t.cart}
                >
                  <ShoppingCart />
                  <span className="hidden sm:inline">{t.cart}</span>
                  <span className="grid size-5 place-items-center rounded-full bg-background text-[10px] font-black text-foreground">
                    {draftProducts.length}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </header>

        {role === "member" && (
          <section className="mx-auto max-w-7xl px-5 pb-10 pt-7 sm:px-8 lg:px-12 lg:pt-10">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-[#b76500] dark:text-[#ffb454]">{t.hello}, {currentUser.name} 👋</p>
                <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-4xl">{t.question}</h1>
              </div>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card/70 px-4 text-sm font-medium">
                <UserRound className="size-4 text-primary" /> {currentUser.name}
              </div>
            </div>

            {memberView === "catalog" ? (
              <>
                <div
                  className="mb-4 inline-flex rounded-2xl border border-border bg-card/70 p-1.5"
                  role="group"
                  aria-label={t.catalog}
                >
                  <Button
                    variant={catalogSource === "family" ? "default" : "ghost"}
                    className="rounded-xl"
                    aria-pressed={catalogSource === "family"}
                    onClick={() => {
                      setCatalogSource("family");
                      setCarrefourVisible(24);
                    }}
                  >
                    <ShoppingBasket /> {t.familyCatalog}
                  </Button>
                  <Button
                    variant={catalogSource === "carrefour" ? "default" : "ghost"}
                    className="rounded-xl"
                    aria-pressed={catalogSource === "carrefour"}
                    onClick={() => {
                      setCatalogSource("carrefour");
                      setCarrefourVisible(24);
                    }}
                  >
                    Carrefour
                  </Button>
                </div>

                <div className="mb-5 flex max-w-3xl gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute start-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setCarrefourVisible(24);
                      }}
                      aria-label={t.search}
                      placeholder={t.search}
                      className="h-14 rounded-2xl border-border bg-card/75 ps-12 text-base placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-primary/15"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-14 shrink-0 rounded-2xl border-primary/25 bg-card/75 px-4 text-primary"
                    onClick={() => setScanDialogOpen(true)}
                    aria-label={t.scanProduct}
                    title={t.scanProduct}
                  >
                    <ScanBarcode className="size-5" />
                    <span className="hidden sm:inline">{t.scanProduct}</span>
                  </Button>
                </div>

                <div className="scrollbar-none -mx-5 mb-8 flex gap-2 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
                  {categoryKeys.map((key) => (
                    <Button
                      key={key}
                      variant={category === key ? "default" : "outline"}
                      className={category === key ? "h-10 rounded-full px-5" : "h-10 rounded-full border-border bg-card/65 px-5 text-muted-foreground"}
                      onClick={() => {
                        setCategory(key);
                        setCarrefourVisible(24);
                      }}
                    >
                      {t[key]}
                    </Button>
                  ))}
                </div>

                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {catalogSource === "carrefour" ? t.carrefourCatalog : t.essentials}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {catalogSource === "carrefour" ? t.carrefourHint : t.estimated}
                    </p>
                    {catalogSource === "carrefour" && (
                      <p className="mt-1 text-xs font-medium text-primary">{t.carrefourRules}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="border-border bg-card/70 px-3 py-1.5 text-muted-foreground">
                    {catalogSource === "carrefour"
                      ? filteredCarrefourProducts.length
                      : filteredProducts.length}
                  </Badge>
                </div>

                {catalogSource === "family" ? (
                  filteredProducts.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                      {filteredProducts.map((product) => (
                        <article key={product.id} className="group overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-[0_18px_50px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.15)]">
                          <ProductImage
                            position={product.image_position}
                            name={productName(product)}
                            imageUrl={product.image_url}
                            className="relative aspect-[1.05] transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                          <div className="p-3.5 sm:p-4">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <h3 className="min-w-0 truncate font-semibold sm:text-lg">{productName(product)}</h3>
                              {product.purchase_count >= 10 && (
                                <Sparkles className="mt-1 size-4 shrink-0 text-[#ffb454]" aria-label="Fréquent" />
                              )}
                            </div>
                            <Badge variant="outline" className="mb-3 border-border bg-muted/45 text-muted-foreground">
                              {product.package_size || `1 ${product.unit}`}
                            </Badge>
                            <div className="flex items-end justify-between gap-2">
                              <p className="text-lg font-bold tracking-tight sm:text-xl">
                                {product.unit_price_cents > 0 ? money(product.unit_price_cents) : t.priceToConfirm}
                              </p>
                              <Button
                                size="icon-sm"
                                className="rounded-xl"
                                onClick={() => addToCart(product)}
                                aria-label={`Ajouter ${productName(product)}`}
                              >
                                <Plus />
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center text-muted-foreground">
                      <Search className="mx-auto mb-3 size-7" />
                      {t.noProducts}
                    </div>
                  )
                ) : carrefourLoading ? (
                  <div aria-label={t.carrefourLoading} className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }, (_, index) => (
                      <div key={index} className="overflow-hidden rounded-[1.35rem] border border-border bg-card p-3">
                        <Skeleton className="aspect-[1.05] w-full rounded-2xl" />
                        <Skeleton className="mt-4 h-5 w-4/5" />
                        <Skeleton className="mt-3 h-8 w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : carrefourError ? (
                  <div className="rounded-3xl border border-dashed border-destructive/40 bg-card/60 p-10 text-center">
                    <AlertTriangle className="mx-auto mb-3 size-7 text-destructive" />
                    <p className="text-muted-foreground">{carrefourError}</p>
                    <Button className="mt-5 rounded-xl" onClick={() => void loadCarrefourCatalogue()}>
                      {t.retry}
                    </Button>
                  </div>
                ) : visibleCarrefourProducts.length ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                      {visibleCarrefourProducts.map((product) => (
                        <article
                          key={product.external_id}
                          className="group flex min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-[0_18px_50px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.15)]"
                        >
                          <div className="relative overflow-hidden">
                            <ProductImage
                              position="0% 0%"
                              name={product.name}
                              imageUrl={product.image_url}
                              className="aspect-[1.05] transition-transform duration-500 group-hover:scale-[1.02]"
                            />
                            {product.crossed_price_cents && (
                              <Badge className="absolute start-3 top-3 bg-[#c46b00] text-white hover:bg-[#c46b00]">
                                {t.promotion}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col p-3.5 sm:p-4">
                            <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 sm:text-base">
                              {product.name}
                            </h3>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="border-border bg-muted/45 text-muted-foreground">
                                {product.package_size || quantityLabel(100, "pièce")}
                              </Badge>
                              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                                {product.store}
                              </Badge>
                            </div>
                            <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                              <div>
                                {product.crossed_price_cents && (
                                  <p className="text-xs text-muted-foreground line-through">
                                    {money(product.crossed_price_cents)}
                                  </p>
                                )}
                                <p className="text-lg font-bold tracking-tight sm:text-xl">
                                  {money(product.price_cents)}
                                </p>
                              </div>
                              <Button
                                size="icon-sm"
                                className="shrink-0 rounded-xl"
                                disabled={carrefourBusyId === product.external_id}
                                onClick={() => void addCarrefourProduct(product)}
                                aria-label={`${t.addProduct}: ${product.name}`}
                              >
                                {carrefourBusyId === product.external_id ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Plus />
                                )}
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {visibleCarrefourProducts.length < filteredCarrefourProducts.length && (
                      <div className="mt-7 flex justify-center">
                        <Button
                          variant="outline"
                          className="rounded-xl bg-card"
                          onClick={() => setCarrefourVisible((current) => current + 24)}
                        >
                          {t.loadMore}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center text-muted-foreground">
                    <Search className="mx-auto mb-3 size-7" />
                    {t.noProducts}
                  </div>
                )}
              </>
            ) : (
              <MemberCarts
                carts={memberActive}
                latestResult={latestMemberResult}
                itemsFor={itemsFor}
                productName={productName}
                quantityLabel={quantityLabel}
                money={money}
                statusText={statusText}
                t={t}
                busy={busy}
                onEdit={editCart}
                onCancel={(cart) =>
                  void act(
                    { action: "cancel_cart", actorRole: "member", cartId: cart.id, memberId: currentUser.id },
                    "Panier annulé.",
                  )
                }
              />
            )}
          </section>
        )}

        {role === "admin" && (
          <AdminDashboard
            data={data}
            pendingCarts={pendingCarts}
            itemsFor={itemsFor}
            productName={productName}
            money={money}
            quantityLabel={quantityLabel}
            currentMonthlyTotal={currentMonthlyTotal}
            currentMonth={currentMonth}
            productPrices={productPrices}
            setProductPrices={setProductPrices}
            newProduct={newProduct}
            setNewProduct={setNewProduct}
            addDialogOpen={addDialogOpen}
            setAddDialogOpen={setAddDialogOpen}
            parsePrice={parsePrice}
            act={act}
            busy={busy}
            t={t}
            language={language}
          />
        )}

        {role === "delivery" && (
          <DeliveryDashboard
            queue={deliveryQueue}
            history={deliveryHistory}
            view={deliveryView}
            setView={setDeliveryView}
            itemsFor={itemsFor}
            productName={productName}
            quantityLabel={quantityLabel}
            money={money}
            prices={deliveryPrices}
            setPrices={setDeliveryPrices}
            parsePrice={parsePrice}
            act={act}
            busy={busy}
            t={t}
            language={language}
          />
        )}
      </div>

      {role === "member" && (
        <nav aria-label="Navigation mobile" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-2 rounded-[1.4rem] border border-border bg-card/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl lg:hidden">
          <Button
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-2xl ${memberView === "catalog" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}
            onClick={() => setMemberView("catalog")}
          >
            <ShoppingBasket className="size-5" /><span className="text-[11px]">{t.catalog}</span>
          </Button>
          <Button
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-2xl ${memberView === "carts" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}
            onClick={() => setMemberView("carts")}
          >
            <ListChecks className="size-5" /><span className="text-[11px]">{t.carts}</span>
          </Button>
        </nav>
      )}

      {role === "member" && (
        <BarcodeScannerDialog
          open={scanDialogOpen}
          onOpenChange={setScanDialogOpen}
          language={language}
          onProduct={addScannedProduct}
        />
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side={language === "ar" ? "left" : "right"} className="w-[92%] border-border bg-card sm:max-w-md">
          <SheetHeader className="p-5 pb-2">
            <SheetTitle className="text-2xl">{editingCartId ? t.edit : t.cart}</SheetTitle>
            <SheetDescription>{t.activeLimit}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {draftProducts.length ? (
              <div className="space-y-3">
                {draftProducts.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-border bg-muted/45 p-3">
                    <ProductImage position={product.image_position} imageUrl={product.image_url} name={productName(product)} className="size-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{productName(product)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {product.unit_price_cents > 0
                          ? `${money(product.unit_price_cents)} / ${product.unit}`
                          : t.priceToConfirm}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl bg-background p-1">
                      <Button size="icon-xs" variant="ghost" onClick={() => changeQuantity(product, -1)} aria-label="Réduire">
                        <X />
                      </Button>
                      <span className="min-w-12 text-center text-xs font-bold">{quantityLabel(quantity, product.unit)}</span>
                      <Button size="icon-xs" variant="ghost" onClick={() => changeQuantity(product, 1)} aria-label="Ajouter">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-64 place-items-center text-center">
                <div>
                  <ShoppingCart className="mx-auto mb-3 size-9 text-muted-foreground" />
                  <p className="text-muted-foreground">{t.emptyCart}</p>
                </div>
              </div>
            )}
          </div>
          <SheetFooter className="border-t border-border p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t.estimate}</span>
              <strong className="text-xl">{money(draftTotal)}</strong>
            </div>
            <Button
              size="lg"
              className="h-12 rounded-2xl"
              disabled={!draftProducts.length || busy}
              onClick={() => void submitCart()}
            >
              {busy && <Loader2 className="animate-spin" />}
              {editingCartId ? t.update : t.submit}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

type CopySet = (typeof words)[Language];

function MemberCarts({
  carts,
  latestResult,
  itemsFor,
  productName,
  quantityLabel,
  money,
  statusText,
  t,
  busy,
  onEdit,
  onCancel,
}: {
  carts: Cart[];
  latestResult: Cart | null;
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  quantityLabel: (quantity: number, unit: Product["unit"]) => string;
  money: (cents: number) => string;
  statusText: Record<CartStatus, string>;
  t: CopySet;
  busy: boolean;
  onEdit: (cart: Cart) => void;
  onCancel: (cart: Cart) => void;
}) {
  const statusStyles: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ready: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    shopping: "border-primary/25 bg-primary/10 text-primary",
    completed: "border-primary/25 bg-primary/10 text-primary",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t.carts}</h2>
          <Badge variant="outline" className="border-border">{carts.length}/3</Badge>
        </div>
        <div className="space-y-4">
          {carts.length ? carts.map((cart) => (
            <article key={cart.id} className="rounded-3xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Panier #{cart.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(cart.submitted_at).toLocaleString("fr-MA", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <Badge variant="outline" className={statusStyles[cart.status]}>{statusText[cart.status]}</Badge>
              </div>
              <div className="space-y-2">
                {itemsFor(cart.id).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5 text-sm">
                    <span className="truncate">{productName(item)}</span>
                    <span className="shrink-0 text-muted-foreground">{quantityLabel(item.quantity_hundredths, item.unit)}</span>
                  </div>
                ))}
              </div>
              {cart.status !== "shopping" && (
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl border-border" onClick={() => onEdit(cart)} disabled={busy}>
                    <Pencil /> {t.edit}
                  </Button>
                  <Button variant="ghost" className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onCancel(cart)} disabled={busy}>
                    <Trash2 /> {t.cancel}
                  </Button>
                </div>
              )}
            </article>
          )) : (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 p-9 text-center text-muted-foreground">
              <ShoppingBasket className="mx-auto mb-3 size-8" />
              {t.emptyCart}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t.result}</h2>
        {latestResult ? (
          <article className="rounded-3xl border border-primary/15 bg-primary/[0.045] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/12 text-primary"><CircleCheck /></span>
              <div>
                <p className="font-semibold">Panier #{latestResult.id}</p>
                <p className="text-xs text-muted-foreground">{statusText.completed}</p>
              </div>
            </div>
            <div className="space-y-2">
              {itemsFor(latestResult.id).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted/45 p-3">
                  {item.purchase_status === "bought" ? <Check className="size-4 text-primary" /> : <X className="size-4 text-destructive" />}
                  <span className="min-w-0 flex-1 truncate">{productName(item)}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.purchase_status === "bought" ? money(Math.round(item.actual_unit_price_cents * item.quantity_hundredths / 100)) : t.unbought}
                  </span>
                </div>
              ))}
            </div>
          </article>
        ) : (
          <div className="rounded-3xl border border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({
  data,
  pendingCarts,
  itemsFor,
  productName,
  money,
  quantityLabel,
  currentMonthlyTotal,
  currentMonth,
  productPrices,
  setProductPrices,
  newProduct,
  setNewProduct,
  addDialogOpen,
  setAddDialogOpen,
  parsePrice,
  act,
  busy,
  t,
  language,
}: {
  data: AppData;
  pendingCarts: Cart[];
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  money: (cents: number) => string;
  quantityLabel: (quantity: number, unit: Product["unit"]) => string;
  currentMonthlyTotal: number;
  currentMonth: string;
  productPrices: Record<number, string>;
  setProductPrices: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  newProduct: { nameFr: string; nameAr: string; nameEn: string; category: string; unit: string; price: string };
  setNewProduct: React.Dispatch<React.SetStateAction<{ nameFr: string; nameAr: string; nameEn: string; category: string; unit: string; price: string }>>;
  addDialogOpen: boolean;
  setAddDialogOpen: (value: boolean) => void;
  parsePrice: (value: string) => number;
  act: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  busy: boolean;
  t: CopySet;
  language: Language;
}) {
  const submitNewProduct = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(
      {
        action: "add_product",
        actorRole: "admin",
        ...newProduct,
        unitPriceCents: parsePrice(newProduct.price),
      },
      "Produit ajouté.",
    );
    if (ok) {
      setAddDialogOpen(false);
      setNewProduct({ nameFr: "", nameAr: "", nameEn: "", category: "food", unit: "pièce", price: "" });
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-7 sm:px-8 lg:px-12 lg:pt-10">
      <div className="mb-7">
        <p className="mb-2 text-sm font-semibold text-[#b76500] dark:text-[#ffb454]">{t.admin}</p>
        <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">La maison, en un coup d’œil.</h1>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-7 h-11 w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-2xl bg-muted/60 p-1 sm:w-fit">
          <TabsTrigger value="requests" className="h-9 rounded-xl px-4">
            <ListChecks /> {t.requests}
            {pendingCarts.length > 0 && <Badge className="ms-1 h-5 min-w-5 px-1.5">{pendingCarts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="products" className="h-9 rounded-xl px-4"><PackagePlus /> {t.products}</TabsTrigger>
          <TabsTrigger value="analytics" className="h-9 rounded-xl px-4"><BarChart3 /> {t.analytics}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t.awaiting}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.choosePriority}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingCarts.length ? pendingCarts.map((cart) => (
              <article key={cart.id} className="rounded-3xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 font-bold text-primary">{cart.member_initials}</span>
                    <div>
                      <p className="font-semibold">{cart.member_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cart.submitted_at).toLocaleString(language === "ar" ? "ar-MA" : "fr-MA", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    {itemsFor(cart.id).length} {t.items}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {itemsFor(cart.id).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5 text-sm">
                      <span className="truncate">{productName(item)}</span>
                      <span className="shrink-0 text-muted-foreground">{quantityLabel(item.quantity_hundredths, item.unit)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border-border"
                    disabled={busy}
                    onClick={() => void act({ action: "set_priority", actorRole: "admin", cartId: cart.id, priority: "normal" }, "Priorité normale enregistrée.")}
                  >
                    <Clock3 /> {t.normal}
                  </Button>
                  <Button
                    className="h-11 rounded-xl bg-[#ffb454] text-[#211609] hover:bg-[#ffc16d]"
                    disabled={busy}
                    onClick={() => void act({ action: "set_priority", actorRole: "admin", cartId: cart.id, priority: "urgent" }, "Priorité urgente enregistrée.")}
                  >
                    <AlertTriangle /> {t.urgent}
                  </Button>
                </div>
              </article>
            )) : (
              <div className="col-span-full rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
                <CircleCheck className="mx-auto mb-3 size-8 text-primary" />{t.noRequests}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="products">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{t.products}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.products.length} produits actifs</p>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl"><Plus /> {t.addProduct}</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl border-border bg-card">
                <form onSubmit={(event) => void submitNewProduct(event)}>
                  <DialogHeader>
                    <DialogTitle>{t.addProduct}</DialogTitle>
                    <DialogDescription>Les trois langues sont prêtes dès maintenant.</DialogDescription>
                  </DialogHeader>
                  <div className="my-6 grid gap-4">
                    <div className="grid gap-2"><Label htmlFor="name-fr">Nom français</Label><Input id="name-fr" required value={newProduct.nameFr} onChange={(event) => setNewProduct((current) => ({ ...current, nameFr: event.target.value }))} /></div>
                    <div className="grid gap-2"><Label htmlFor="name-ar">Nom arabe</Label><Input id="name-ar" dir="rtl" value={newProduct.nameAr} onChange={(event) => setNewProduct((current) => ({ ...current, nameAr: event.target.value }))} /></div>
                    <div className="grid gap-2"><Label htmlFor="name-en">Nom anglais</Label><Input id="name-en" value={newProduct.nameEn} onChange={(event) => setNewProduct((current) => ({ ...current, nameEn: event.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Catégorie</Label>
                        <Select value={newProduct.category} onValueChange={(value) => setNewProduct((current) => ({ ...current, category: value }))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{categoryKeys.slice(1).map((key) => <SelectItem key={key} value={key}>{t[key]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Unité</Label>
                        <Select value={newProduct.unit} onValueChange={(value) => setNewProduct((current) => ({ ...current, unit: value }))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="L">Litre</SelectItem><SelectItem value="kg">kg</SelectItem><SelectItem value="pièce">Pièce</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="new-price">{t.price} (DH)</Label><Input id="new-price" inputMode="decimal" required placeholder="12,50" value={newProduct.price} onChange={(event) => setNewProduct((current) => ({ ...current, price: event.target.value }))} /></div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={busy} className="rounded-xl">{busy && <Loader2 className="animate-spin" />}{t.save}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {data.products.map((product) => (
              <article key={product.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
                <ProductImage position={product.image_position} imageUrl={product.image_url} name={productName(product)} className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{productName(product)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.package_size || `1 ${product.unit}`} · {t[product.category as keyof CopySet] ?? product.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`${t.price}: ${productName(product)}`}
                    inputMode="decimal"
                    className="h-10 w-24 rounded-xl text-end"
                    value={productPrices[product.id] ?? ""}
                    onChange={(event) => setProductPrices((current) => ({ ...current, [product.id]: event.target.value }))}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl border-border"
                    disabled={busy}
                    onClick={() => void act({ action: "update_product", actorRole: "admin", productId: product.id, unitPriceCents: parsePrice(productPrices[product.id] ?? "") }, "Prix mis à jour.")}
                    aria-label={t.save}
                  >
                    <Check />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
            <article className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-primary/15 to-card p-6 sm:p-8">
              <div className="absolute -end-12 -top-16 size-52 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative">
                <span className="mb-7 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><BarChart3 /></span>
                <p className="text-sm font-medium text-muted-foreground">{t.monthlyTotal}</p>
                <p className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">{money(currentMonthlyTotal)}</p>
                <p className="mt-3 text-sm text-primary">{t.boughtOnly}</p>
              </div>
            </article>
            <article className="rounded-[2rem] border border-border bg-card p-6">
              <p className="font-semibold">Mois précédents</p>
              <div className="mt-5 space-y-4">
                {data.monthlyTotals.filter((entry) => entry.month !== currentMonth).slice(0, 4).map((entry) => (
                  <div key={entry.month} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{entry.month}</span>
                    <strong>{money(entry.total_cents)}</strong>
                  </div>
                ))}
                {!data.monthlyTotals.some((entry) => entry.month !== currentMonth) && <p className="text-sm text-muted-foreground">Aucune donnée précédente.</p>}
              </div>
            </article>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function DeliveryDashboard({
  queue,
  history,
  view,
  setView,
  itemsFor,
  productName,
  quantityLabel,
  money,
  prices,
  setPrices,
  parsePrice,
  act,
  busy,
  t,
  language,
}: {
  queue: Cart[];
  history: Cart[];
  view: "queue" | "history";
  setView: (view: "queue" | "history") => void;
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  quantityLabel: (quantity: number, unit: Product["unit"]) => string;
  money: (cents: number) => string;
  prices: Record<number, string>;
  setPrices: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  parsePrice: (value: string) => number;
  act: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  busy: boolean;
  t: CopySet;
  language: Language;
}) {
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const selectedCart = queue.find((cart) => cart.id === selectedCartId) ?? queue[0];
  const otherCarts = selectedCart
    ? queue.filter((cart) => cart.id !== selectedCart.id)
    : [];
  const activeItems = selectedCart ? itemsFor(selectedCart.id) : [];
  const completeReady = activeItems.length > 0 && activeItems.every((item) => item.purchase_status !== "requested");

  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-7 sm:px-8 lg:px-12 lg:pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-[#b76500] dark:text-[#ffb454]">{t.delivery}</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{view === "queue" ? t.queue : t.history}</h1>
        </div>
        <div className="flex rounded-2xl bg-muted/60 p-1">
          <Button variant="ghost" className={`rounded-xl ${view === "queue" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} onClick={() => setView("queue")}>
            <ShoppingBasket /> {t.queue}
          </Button>
          <Button variant="ghost" className={`rounded-xl ${view === "history" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} onClick={() => setView("history")}>
            <ListChecks /> {t.history}
          </Button>
        </div>
      </div>

      {view === "queue" ? (
        selectedCart ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 font-bold text-primary">{selectedCart.member_initials}</span>
                  <div>
                    <p className="text-lg font-semibold">{selectedCart.member_name} · {t.cart} #{selectedCart.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(selectedCart.submitted_at).toLocaleString(language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                </div>
                <Badge
                  className={
                    selectedCart.priority === "urgent"
                      ? "bg-[#ffb454] text-[#211609]"
                      : selectedCart.priority === "normal"
                        ? "bg-primary/12 text-primary"
                        : "bg-blue-500/12 text-blue-700 dark:text-blue-300"
                  }
                >
                  {selectedCart.priority === "urgent" ? <AlertTriangle /> : <Clock3 />}
                  {selectedCart.priority === "urgent" ? t.urgent : selectedCart.priority === "normal" ? t.normal : t.newOrder}
                </Badge>
              </div>

              <div className="space-y-3">
                {activeItems.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-3 sm:grid-cols-[64px_1fr_125px_auto] sm:items-center">
                    <ProductImage position={item.image_position} imageUrl={item.image_url} name={productName(item)} className="size-16 rounded-xl" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{productName(item)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {quantityLabel(item.quantity_hundredths, item.unit)}
                        {item.package_size ? ` · ${item.package_size}` : ""}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor={`delivery-price-${item.id}`} className="mb-1.5 text-xs text-muted-foreground">{t.price}</Label>
                      <div className="relative">
                        <Input
                          id={`delivery-price-${item.id}`}
                          inputMode="decimal"
                          className="h-10 rounded-xl pe-10"
                          value={prices[item.id] ?? ""}
                          onChange={(event) => setPrices((current) => ({ ...current, [item.id]: event.target.value }))}
                        />
                        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DH</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        size="icon"
                        variant={item.purchase_status === "bought" ? "default" : "outline"}
                        className="rounded-xl border-border"
                        disabled={busy}
                        onClick={() => void act({ action: "update_item", actorRole: "delivery", itemId: item.id, purchaseStatus: "bought", actualUnitPriceCents: parsePrice(prices[item.id] ?? "") }, "Article marqué acheté.")}
                        aria-label={t.bought}
                      >
                        <Check />
                      </Button>
                      <Button
                        size="icon"
                        variant={item.purchase_status === "unbought" ? "destructive" : "outline"}
                        className="rounded-xl border-border"
                        disabled={busy}
                        onClick={() => void act({ action: "update_item", actorRole: "delivery", itemId: item.id, purchaseStatus: "unbought", actualUnitPriceCents: parsePrice(prices[item.id] ?? "") }, "Article marqué non acheté.")}
                        aria-label={t.unbought}
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-6 bg-border" />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{activeItems.filter((item) => item.purchase_status !== "requested").length}/{activeItems.length} {t.items}</p>
                  <p className="mt-1 font-semibold">
                    {money(activeItems.filter((item) => item.purchase_status === "bought").reduce((sum, item) => sum + Math.round(item.actual_unit_price_cents * item.quantity_hundredths / 100), 0))}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="h-12 rounded-2xl"
                  disabled={!completeReady || busy}
                  onClick={() => void act({ action: "finish_cart", actorRole: "delivery", cartId: selectedCart.id }, "Panier terminé et enregistré.")}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />}
                  {t.finish}
                </Button>
              </div>
            </article>

            <aside>
              <h2 className="mb-4 font-semibold">{t.next}</h2>
              <div className="space-y-3">
                {otherCarts.map((cart) => (
                  <button
                    key={cart.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start transition hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setSelectedCartId(cart.id)}
                    aria-label={`${t.openCart} ${cart.member_name} #${cart.id}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-sm font-bold text-primary">{queue.findIndex((entry) => entry.id === cart.id) + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{cart.member_name}</p><p className="text-xs text-muted-foreground">{itemsFor(cart.id).length} {t.items}</p></div>
                    {cart.priority === "urgent" && <AlertTriangle className="size-4 text-[#ffb454]" />}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
                {queue.length === 1 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">—</p>}
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-primary/20 bg-primary/[0.035] p-12 text-center">
            <CircleCheck className="mx-auto mb-4 size-10 text-primary" /><p className="font-semibold">{t.noQueue}</p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {history.map((cart) => {
            const boughtItems = itemsFor(cart.id).filter((item) => item.purchase_status === "bought");
            const total = boughtItems.reduce((sum, item) => sum + Math.round(item.actual_unit_price_cents * item.quantity_hundredths / 100), 0);
            return (
              <article key={cart.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Check /></span>
                <div className="min-w-0 flex-1"><p className="font-semibold">{cart.member_name} · #{cart.id}</p><p className="mt-1 text-xs text-muted-foreground">{cart.completed_at ? new Date(cart.completed_at).toLocaleDateString("fr-MA", { dateStyle: "medium" }) : ""}</p></div>
                <Badge variant="outline" className="border-border">{boughtItems.length}/{itemsFor(cart.id).length} {t.bought.toLocaleLowerCase()}</Badge>
                <strong>{money(total)}</strong>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
