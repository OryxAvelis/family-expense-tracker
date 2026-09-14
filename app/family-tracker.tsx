"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Crown,
  Heart,
  ImagePlus,
  Languages,
  ListChecks,
  Loader2,
  LogOut,
  MessageSquareText,
  Moon,
  PackageCheck,
  PackagePlus,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  Repeat2,
  ScanBarcode,
  Search,
  Settings2,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  UserCog,
  UserCheck,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  BarcodeScannerDialog,
  type ScannedCatalogProduct,
} from "@/app/barcode-scanner-dialog";
import { AdminAnalyticsCharts } from "@/app/admin-analytics-charts";
import { ProfileAvatar, ProfilePhotoEditor } from "@/app/profile-photo";
import { useFamilyTheme } from "@/hooks/use-family-theme";
import type { FamilySessionUser } from "@/lib/family-auth";

type Language = "fr" | "ar" | "en";
type Role = "member" | "admin" | "delivery";
type CatalogSource = "family" | "mymarket";
type CartStatus = "pending" | "ready" | "shopping" | "completed";
type Priority = "urgent" | "normal" | null;
type PurchaseStatus = "requested" | "bought" | "unbought";

const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AMOUNT_REQUEST_SENTINEL_CENTS = 2_147_483_647;

type FamilyUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  initials: string;
};

type PendingUser = {
  id: number;
  name: string;
  username: string;
  initials: string;
  created_at: string;
};

type PlanPayment = {
  id: string;
  user_id: number;
  user_name: string;
  scope: "family" | "personal";
  plan: "plus" | "pro";
  amount_cents: number;
  status: "pending" | "confirmed" | "rejected";
  request_type?: "payment" | "trial";
  created_at: string;
  confirmed_at: string | null;
  proof_key?: string | null;
  proof_name?: string | null;
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
  has_orders: number;
};

type ProductFormDraft = {
  nameFr: string;
  nameAr: string;
  nameEn: string;
  category: string;
  unit: string;
  price: string;
};

type MyMarketProduct = {
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
  missing_products_note: string;
  service_fee_cents: number;
};

type CartItem = {
  id: number;
  cart_id: number;
  product_id: number;
  quantity_hundredths: number;
  requested_unit_price_cents: number;
  actual_unit_price_cents: number;
  catalog_unit_price_cents: number;
  purchase_status: PurchaseStatus;
  name_fr: string;
  name_ar: string;
  name_en: string;
  unit: Product["unit"];
  image_position: string;
  image_url: string | null;
  package_size: string | null;
};

const isAmountItem = (item: Pick<CartItem, "requested_unit_price_cents">) =>
  item.requested_unit_price_cents === AMOUNT_REQUEST_SENTINEL_CENTS;

function measuredPackageSize(packageSize?: string | null) {
  const match = packageSize
    ?.trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)$/i);
  if (!match) return null;

  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;

  const rawUnit = match[2].toLocaleLowerCase();
  if (rawUnit === "kg") return { amount: value, unit: "kg" as const };
  if (rawUnit === "g") return { amount: value / 1000, unit: "kg" as const };
  if (rawUnit === "l") return { amount: value, unit: "L" as const };
  if (rawUnit === "cl") return { amount: value / 100, unit: "L" as const };
  return { amount: value / 1000, unit: "L" as const };
}

const cartItemTotalCents = (
  item: Pick<CartItem, "requested_unit_price_cents" | "actual_unit_price_cents" | "quantity_hundredths">,
) =>
  isAmountItem(item)
    ? item.actual_unit_price_cents
    : Math.round((item.actual_unit_price_cents * item.quantity_hundredths) / 100);

type MonthlyTotal = {
  month: string;
  total_cents: number;
  carts_count: number;
};

type DeliveryWallet = {
  completedOrders: number;
  completedMissions: number;
  earnedCents: number;
  missionEarnedCents: number;
  paidCents: number;
  unpaidCents: number;
  completedThisMonth: number;
  missionsThisMonth: number;
  earnedThisMonthCents: number;
};

type MemberWalletTransaction = {
  id: string;
  type: "deposit" | "order" | "task";
  amount_cents: number;
  cart_id: number | null;
  task_id?: string | null;
  created_at: string;
  actor_name: string;
};

type MemberWallet = {
  member_id: number;
  member_name: string;
  member_initials: string;
  balance_cents: number;
  credited_cents: number;
  spent_cents: number;
  transactions: MemberWalletTransaction[];
};

type AppData = {
  users: FamilyUser[];
  products: Product[];
  carts: Cart[];
  items: CartItem[];
  monthlyTotals: MonthlyTotal[];
  pendingUsers: PendingUser[];
  deliveryServiceFeeCents: number;
  currentPlan: "free" | "plus" | "pro";
  monthlyBudgetCents: number;
  favoriteProductIds: number[];
  deliveryWallet: DeliveryWallet;
  memberWallets: MemberWallet[];
  pushPublicKey: string | null;
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
    missingProducts: "Produits non trouvés",
    missingProductsHint: "Écrivez les produits absents du catalogue, avec la quantité.",
    optional: "Facultatif",
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
    balances: "Soldes",
    awaiting: "Paniers à classer",
    choosePriority: "Déjà visible par le livreur — choisissez simplement sa priorité.",
    urgent: "Urgent",
    normal: "Normal",
    noRequests: "Aucune demande en attente.",
    accountRequests: "Nouveaux membres",
    accountRequestsHelp: "Vérifiez la personne avant de lui ouvrir l’accès familial.",
    noAccountRequests: "Aucune demande de compte.",
    approveAccount: "Approuver",
    rejectAccount: "Refuser",
    rejectAccountTitle: "Refuser cette demande ?",
    rejectAccountHelp: "La demande sera supprimée. Cette personne pourra créer un nouveau compte plus tard.",
    keepRequest: "Garder la demande",
    accountApproved: "Compte approuvé.",
    accountRejected: "Demande refusée.",
    requestedOn: "Demandé le",
    price: "Prix unitaire",
    save: "Enregistrer",
    addProduct: "Ajouter un produit",
    productImage: "Photo du produit",
    chooseImage: "Choisir une photo",
    changeImage: "Changer la photo",
    removeImage: "Retirer",
    imageHint: "JPG, PNG ou WebP · 5 Mo maximum",
    imageInvalid: "Choisissez une image JPG, PNG ou WebP.",
    imageTooLarge: "L’image ne doit pas dépasser 5 Mo.",
    invalidPrice: "Saisissez un prix valide.",
    editProduct: "Modifier le produit",
    deleteProduct: "Supprimer le produit",
    deleteProductHelp: "Il disparaîtra du catalogue, mais l’historique des achats sera conservé.",
    confirmDelete: "Supprimer",
    unitLocked: "L’unité est verrouillée après la première commande.",
    monthlyTotal: "Total dépensé ce mois",
    boughtOnly: "Produits achetés et service de livraison",
    serviceFee: "Service de livraison",
    serviceFeeHelp: "0,50 DH par commande terminée",
    totalWithService: "Total avec service",
    serviceEarnings: "Gains de service ce mois",
    completedOrders: "commandes terminées",
    wallet: "Portefeuille de Josef",
    earned: "Gagné",
    paid: "Payé",
    unpaid: "À payer",
    allTime: "Depuis le début",
    settleWallet: "Marquer comme payé",
    settleWalletHelp: "Confirmez que tout le montant restant a été remis à Josef.",
    walletSettled: "Le portefeuille de Josef est à jour.",
    budget: "Budget familial",
    monthlyBudget: "Budget mensuel",
    setBudget: "Enregistrer le budget",
    budgetSaved: "Budget mensuel enregistré.",
    budgetNotSet: "Aucun budget défini",
    budgetRemaining: "Reste disponible",
    budgetWarning: "Le budget approche de sa limite.",
    budgetExceeded: "Le budget mensuel est dépassé.",
    favorites: "Favoris",
    favoritesOnly: "Favoris seulement",
    favoriteAdded: "Produit ajouté aux favoris.",
    favoriteRemoved: "Produit retiré des favoris.",
    repeatOrder: "Recommander ce panier",
    orderRepeated: "Le panier est prêt à être renvoyé.",
    notificationsNewOrders: "Notifications des nouvelles commandes",
    notificationsHelp: "Recevez une alerte même lorsque le site est fermé.",
    enableNotifications: "Activer",
    disableNotifications: "Désactiver",
    notificationsEnabled: "Notifications activées",
    notificationsDisabled: "Notifications désactivées",
    notificationsBlocked: "Les notifications sont bloquées dans le navigateur.",
    notificationsUnavailable: "Notifications indisponibles sur cet appareil.",
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
    buyByAmount: "Acheter par montant",
    amountToSpend: "Montant à dépenser",
    amountHelp: "La quantité sera calculée automatiquement selon le prix au kilo ou au litre.",
    estimatedQuantity: "Quantité estimée",
    addForAmount: "Ajouter pour ce montant",
    invalidAmount: "Saisissez un montant valide.",
    forAmount: "Pour",
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
    myMarketCatalog: "Catalogue MyMarket",
    myMarketHint: "Prix MyMarket en ligne — Josef confirme le prix réel.",
    myMarketRules: "Tous les rayons sauf Animaux",
    myMarketLoading: "Chargement du catalogue MyMarket…",
    myMarketSearching: "Recherche dans les trois langues…",
    myMarketAdded: "Produit MyMarket ajouté au panier.",
    promotion: "Promo",
    loadMore: "Afficher plus",
    noProducts: "Aucun produit trouvé.",
    settings: "Réglages",
    settingsTitle: "Vos réglages",
    settingsDescription: "Personnalisez l’affichage et consultez votre compte.",
    account: "Compte",
    appearance: "Apparence",
    languageSetting: "Langue de l’interface",
    themeSetting: "Thème de l’application",
    light: "Clair",
    dark: "Sombre",
    username: "Nom d’utilisateur",
    profilePhoto: "Photo de profil",
    profilePhotoDescription: "Choisissez la photo qui vous représentera dans l’espace familial.",
    editProfilePhoto: "Modifier la photo de profil",
    memberBalance: "Solde personnel",
    availableBalance: "Solde disponible",
    moneyReceived: "Argent reçu",
    orderExpenses: "Dépenses des commandes",
    balanceHistory: "Historique du solde",
    noBalanceHistory: "Aucun mouvement pour le moment.",
    deposit: "Versement",
    orderDebit: "Commande",
    memberBalances: "Soldes des membres",
    memberBalancesHelp: "Enregistrez l’argent remis à Josef. Les commandes terminées sont déduites automatiquement.",
    addFunds: "Ajouter de l’argent",
    amount: "Montant",
    fundsAdded: "Versement ajouté au solde.",
    negativeBalance: "Montant à remettre au livreur",
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
    missingProducts: "منتجات غير موجودة",
    missingProductsHint: "اكتب المنتجات غير الموجودة في القائمة مع الكمية.",
    optional: "اختياري",
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
    balances: "الأرصدة",
    awaiting: "سلال تنتظر التصنيف",
    choosePriority: "السلة ظاهرة بالفعل للمكلّف بالشراء — حدّد فقط أولويتها.",
    urgent: "مستعجل",
    normal: "عادي",
    noRequests: "لا توجد طلبات منتظرة.",
    accountRequests: "أعضاء جدد",
    accountRequestsHelp: "تحقق من الشخص قبل السماح له بدخول مساحة العائلة.",
    noAccountRequests: "لا توجد طلبات حساب جديدة.",
    approveAccount: "قبول",
    rejectAccount: "رفض",
    rejectAccountTitle: "رفض هذا الطلب؟",
    rejectAccountHelp: "سيتم حذف الطلب، ويمكن لهذا الشخص إنشاء حساب جديد لاحقاً.",
    keepRequest: "الاحتفاظ بالطلب",
    accountApproved: "تم قبول الحساب.",
    accountRejected: "تم رفض الطلب.",
    requestedOn: "طُلب في",
    price: "ثمن الوحدة",
    save: "حفظ",
    addProduct: "إضافة منتج",
    productImage: "صورة المنتج",
    chooseImage: "اختيار صورة",
    changeImage: "تغيير الصورة",
    removeImage: "إزالة",
    imageHint: "JPG أو PNG أو WebP · 5 ميغا كحد أقصى",
    imageInvalid: "اختر صورة JPG أو PNG أو WebP.",
    imageTooLarge: "يجب ألا تتجاوز الصورة 5 ميغا.",
    invalidPrice: "أدخل سعراً صالحاً.",
    editProduct: "تعديل المنتج",
    deleteProduct: "حذف المنتج",
    deleteProductHelp: "سيختفي من الكتالوج، لكن سيبقى سجل المشتريات محفوظاً.",
    confirmDelete: "حذف",
    unitLocked: "تُقفل الوحدة بعد أول طلب.",
    monthlyTotal: "مجموع مصاريف هذا الشهر",
    boughtOnly: "المنتجات المشتراة وخدمة التوصيل",
    serviceFee: "خدمة التوصيل",
    serviceFeeHelp: "0.50 درهم لكل طلب مكتمل",
    totalWithService: "المجموع مع الخدمة",
    serviceEarnings: "أرباح الخدمة هذا الشهر",
    completedOrders: "طلبات مكتملة",
    wallet: "محفظة جوزيف",
    earned: "المكتسب",
    paid: "المدفوع",
    unpaid: "غير المدفوع",
    allTime: "منذ البداية",
    settleWallet: "تحديد الكل كمدفوع",
    settleWalletHelp: "أكد أن جوزيف توصل بكامل المبلغ المتبقي.",
    walletSettled: "محفظة جوزيف محدثة.",
    budget: "ميزانية العائلة",
    monthlyBudget: "الميزانية الشهرية",
    setBudget: "حفظ الميزانية",
    budgetSaved: "تم حفظ الميزانية الشهرية.",
    budgetNotSet: "لم يتم تحديد ميزانية",
    budgetRemaining: "المبلغ المتبقي",
    budgetWarning: "الميزانية تقترب من حدها.",
    budgetExceeded: "تم تجاوز الميزانية الشهرية.",
    favorites: "المفضلة",
    favoritesOnly: "المفضلة فقط",
    favoriteAdded: "تمت إضافة المنتج إلى المفضلة.",
    favoriteRemoved: "تمت إزالة المنتج من المفضلة.",
    repeatOrder: "إعادة هذا الطلب",
    orderRepeated: "السلة جاهزة لإعادة الإرسال.",
    notificationsNewOrders: "إشعارات الطلبات الجديدة",
    notificationsHelp: "توصل بتنبيه حتى عندما يكون الموقع مغلقاً.",
    enableNotifications: "تفعيل",
    disableNotifications: "إيقاف",
    notificationsEnabled: "الإشعارات مفعلة",
    notificationsDisabled: "تم إيقاف الإشعارات",
    notificationsBlocked: "الإشعارات محظورة في المتصفح.",
    notificationsUnavailable: "الإشعارات غير متاحة على هذا الجهاز.",
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
    buyByAmount: "الشراء حسب المبلغ",
    amountToSpend: "المبلغ المراد صرفه",
    amountHelp: "سيتم حساب الكمية تلقائياً حسب ثمن الكيلو أو اللتر.",
    estimatedQuantity: "الكمية التقريبية",
    addForAmount: "أضف بهذا المبلغ",
    invalidAmount: "أدخل مبلغاً صالحاً.",
    forAmount: "بمبلغ",
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
    myMarketCatalog: "منتجات MyMarket",
    myMarketHint: "ثمن MyMarket على الإنترنت — جوزيف يؤكد الثمن الحقيقي.",
    myMarketRules: "كل الأقسام ما عدا الحيوانات",
    myMarketLoading: "جارٍ تحميل منتجات MyMarket…",
    myMarketSearching: "جارٍ البحث باللغات الثلاث…",
    myMarketAdded: "تمت إضافة منتج MyMarket إلى السلة.",
    promotion: "تخفيض",
    loadMore: "عرض المزيد",
    noProducts: "لم يتم العثور على أي منتج.",
    settings: "الإعدادات",
    settingsTitle: "إعداداتك",
    settingsDescription: "خصّص المظهر وراجع معلومات حسابك.",
    account: "الحساب",
    appearance: "المظهر",
    languageSetting: "لغة الواجهة",
    themeSetting: "مظهر التطبيق",
    light: "فاتح",
    dark: "داكن",
    username: "اسم المستخدم",
    profilePhoto: "صورة الملف الشخصي",
    profilePhotoDescription: "اختر الصورة التي ستمثلك داخل مساحة العائلة.",
    editProfilePhoto: "تعديل صورة الملف الشخصي",
    memberBalance: "الرصيد الشخصي",
    availableBalance: "الرصيد المتبقي",
    moneyReceived: "المبلغ المستلم",
    orderExpenses: "مصاريف الطلبات",
    balanceHistory: "سجل الرصيد",
    noBalanceHistory: "لا توجد عمليات بعد.",
    deposit: "إيداع",
    orderDebit: "طلب",
    memberBalances: "أرصدة أفراد العائلة",
    memberBalancesHelp: "سجّل المال المُسلّم لجوزيف. تُخصم الطلبات المكتملة تلقائياً.",
    addFunds: "إضافة المال",
    amount: "المبلغ",
    fundsAdded: "تمت إضافة المبلغ إلى الرصيد.",
    negativeBalance: "المبلغ الواجب تسليمه للمكلّف بالشراء",
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
    missingProducts: "Products not found",
    missingProductsHint: "Write the products missing from the catalog, with the quantity.",
    optional: "Optional",
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
    balances: "Balances",
    awaiting: "Carts to prioritize",
    choosePriority: "Already visible to the buyer — just set its priority.",
    urgent: "Urgent",
    normal: "Normal",
    noRequests: "No requests are waiting.",
    accountRequests: "New members",
    accountRequestsHelp: "Verify the person before opening family access.",
    noAccountRequests: "No account requests.",
    approveAccount: "Approve",
    rejectAccount: "Reject",
    rejectAccountTitle: "Reject this request?",
    rejectAccountHelp: "The request will be removed. This person can create a new account later.",
    keepRequest: "Keep request",
    accountApproved: "Account approved.",
    accountRejected: "Request rejected.",
    requestedOn: "Requested on",
    price: "Unit price",
    save: "Save",
    addProduct: "Add product",
    productImage: "Product photo",
    chooseImage: "Choose a photo",
    changeImage: "Change photo",
    removeImage: "Remove",
    imageHint: "JPG, PNG, or WebP · 5 MB maximum",
    imageInvalid: "Choose a JPG, PNG, or WebP image.",
    imageTooLarge: "The image must be 5 MB or smaller.",
    invalidPrice: "Enter a valid price.",
    editProduct: "Edit product",
    deleteProduct: "Remove product",
    deleteProductHelp: "It will disappear from the catalog, but purchase history will be kept.",
    confirmDelete: "Remove",
    unitLocked: "The unit is locked after the first order.",
    monthlyTotal: "Total spent this month",
    boughtOnly: "Purchased products and delivery service",
    serviceFee: "Delivery service",
    serviceFeeHelp: "0.50 DH per completed order",
    totalWithService: "Total with service",
    serviceEarnings: "Service earnings this month",
    completedOrders: "completed orders",
    wallet: "Josef’s wallet",
    earned: "Earned",
    paid: "Paid",
    unpaid: "Unpaid",
    allTime: "All time",
    settleWallet: "Mark as paid",
    settleWalletHelp: "Confirm that Josef received the full unpaid amount.",
    walletSettled: "Josef’s wallet is up to date.",
    budget: "Family budget",
    monthlyBudget: "Monthly budget",
    setBudget: "Save budget",
    budgetSaved: "Monthly budget saved.",
    budgetNotSet: "No budget set",
    budgetRemaining: "Remaining",
    budgetWarning: "The budget is approaching its limit.",
    budgetExceeded: "The monthly budget has been exceeded.",
    favorites: "Favorites",
    favoritesOnly: "Favorites only",
    favoriteAdded: "Product added to favorites.",
    favoriteRemoved: "Product removed from favorites.",
    repeatOrder: "Repeat this order",
    orderRepeated: "The cart is ready to submit again.",
    notificationsNewOrders: "New-order notifications",
    notificationsHelp: "Receive an alert even when the site is closed.",
    enableNotifications: "Enable",
    disableNotifications: "Disable",
    notificationsEnabled: "Notifications enabled",
    notificationsDisabled: "Notifications disabled",
    notificationsBlocked: "Notifications are blocked in the browser.",
    notificationsUnavailable: "Notifications are unavailable on this device.",
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
    buyByAmount: "Buy by amount",
    amountToSpend: "Amount to spend",
    amountHelp: "The quantity is calculated automatically from the price per kilogram or litre.",
    estimatedQuantity: "Estimated quantity",
    addForAmount: "Add for this amount",
    invalidAmount: "Enter a valid amount.",
    forAmount: "For",
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
    myMarketCatalog: "MyMarket catalog",
    myMarketHint: "Online MyMarket price — Josef confirms the real price.",
    myMarketRules: "All departments except Animals",
    myMarketLoading: "Loading the MyMarket catalog…",
    myMarketSearching: "Searching in all three languages…",
    myMarketAdded: "MyMarket product added to the cart.",
    promotion: "Promo",
    loadMore: "Show more",
    noProducts: "No products found.",
    settings: "Settings",
    settingsTitle: "Your settings",
    settingsDescription: "Personalize the display and review your account.",
    account: "Account",
    appearance: "Appearance",
    languageSetting: "Interface language",
    themeSetting: "App theme",
    light: "Light",
    dark: "Dark",
    username: "Username",
    profilePhoto: "Profile photo",
    profilePhotoDescription: "Choose the photo that represents you in the family space.",
    editProfilePhoto: "Edit profile photo",
    memberBalance: "Personal balance",
    availableBalance: "Available balance",
    moneyReceived: "Money received",
    orderExpenses: "Order expenses",
    balanceHistory: "Balance history",
    noBalanceHistory: "No transactions yet.",
    deposit: "Deposit",
    orderDebit: "Order",
    memberBalances: "Member balances",
    memberBalancesHelp: "Record money given to Josef. Completed orders are deducted automatically.",
    addFunds: "Add money",
    amount: "Amount",
    fundsAdded: "Deposit added to the balance.",
    negativeBalance: "Amount owed to the buyer",
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
  const isBundledProductImage = imageUrl?.startsWith("/products/") && !imageUrl.includes("..");
  const isUploadedProductImage = imageUrl
    ? /^\/api\/products\/images\?key=product-images%2f[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(
        imageUrl,
      )
    : false;
  if (imageUrl && (isBundledProductImage || isUploadedProductImage)) {
    safeRemoteImage = imageUrl;
  } else if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      const isCarrefourStorage =
        parsed.hostname === "storage.googleapis.com" &&
        parsed.pathname.startsWith("/crftobringo-sharing-ma-prelive/");
      const isCarrefourHost =
        parsed.hostname === "backend.carrefour.ma" ||
        parsed.hostname === "assets.carrefour.ma" ||
        parsed.hostname === "media.carrefour.fr";
      const isMyMarketImage =
        parsed.hostname === "cdn.shopify.com" ||
        ((parsed.hostname === "www.mymarket.ma" || parsed.hostname === "mymarket.ma") &&
          parsed.pathname.startsWith("/cdn/shop/"));
      if (
        parsed.protocol === "https:" &&
        (parsed.hostname === "openfoodfacts.org" ||
          parsed.hostname.endsWith(".openfoodfacts.org") ||
          isCarrefourStorage ||
          isCarrefourHost ||
          isMyMarketImage)
      ) {
        safeRemoteImage = parsed.toString();
      }
    } catch {
      safeRemoteImage = null;
    }
  }

  if (!safeRemoteImage && position === "none") {
    return (
      <div
        role="img"
        aria-label={name}
        className={`grid place-items-center bg-primary/8 text-primary ${className}`}
      >
        <PackagePlus className="size-1/3" />
      </div>
    );
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

function MissingProductsNote({
  note,
  label,
  className = "",
}: {
  note: string;
  label: string;
  className?: string;
}) {
  if (!note.trim()) return null;

  return (
    <div className={`flex gap-3 rounded-2xl border border-[#ffb454]/35 bg-[#ffb454]/10 p-4 ${className}`}>
      <MessageSquareText className="mt-0.5 size-5 shrink-0 text-[#b76500] dark:text-[#ffb454]" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#8a4e00] dark:text-[#ffd09a]">{label}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{note}</p>
      </div>
    </div>
  );
}

function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = window.atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer;
}

export function FamilyTracker({
  role,
  currentUser,
}: {
  role: Role;
  currentUser: FamilySessionUser;
}) {
  const [data, setData] = useState<AppData | null>(null);
  const [pendingPlanPayments, setPendingPlanPayments] = useState<PlanPayment[]>([]);
  const [planPaymentHistory, setPlanPaymentHistory] = useState<PlanPayment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<Language>("fr");
  const [memberId] = useState(currentUser.id);
  const [memberView, setMemberView] = useState<"catalog" | "carts" | "settings">("catalog");
  const [deliveryView, setDeliveryView] = useState<"queue" | "history" | "balances">("queue");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [draftAmounts, setDraftAmounts] = useState<Record<number, number>>({});
  const [amountProduct, setAmountProduct] = useState<Product | null>(null);
  const [amountDh, setAmountDh] = useState("");
  const [missingProductsNote, setMissingProductsNote] = useState("");
  const [editingCartId, setEditingCartId] = useState<number | null>(null);
  const [deliveryPrices, setDeliveryPrices] = useState<Record<number, string>>({});
  const [productPrices, setProductPrices] = useState<Record<number, string>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileImageVersion, setProfileImageVersion] = useState(0);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("family");
  const [myMarketProducts, setMyMarketProducts] = useState<MyMarketProduct[]>([]);
  const [myMarketLoading, setMyMarketLoading] = useState(false);
  const [myMarketLoadedLanguage, setMyMarketLoadedLanguage] = useState<Language | null>(null);
  const [myMarketError, setMyMarketError] = useState("");
  const [myMarketVisible, setMyMarketVisible] = useState(24);
  const [myMarketBusyId, setMyMarketBusyId] = useState<string | null>(null);
  const [myMarketRemoteSearch, setMyMarketRemoteSearch] = useState<{
    query: string;
    products: MyMarketProduct[];
  }>({ query: "", products: [] });
  const [myMarketSearchingQuery, setMyMarketSearchingQuery] = useState("");
  const myMarketSearchSequence = useRef(0);
  const [newProduct, setNewProduct] = useState({
    nameFr: "",
    nameAr: "",
    nameEn: "",
    category: "food",
    unit: "pièce",
    price: "",
  });
  const { theme, toggleTheme } = useFamilyTheme();

  const updateLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("family-expense-language", nextLanguage);
  }, []);

  const t = words[language];
  const myMarketSearching =
    search.trim().length >= 2 &&
    myMarketSearchingQuery === search.trim().toLocaleLowerCase();

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
      const [response, servicesResponse] = await Promise.all([
        fetch("/api/family", { cache: "no-store" }),
        role === "admin" ? fetch("/api/services", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const payload = (await response.json()) as AppData & { error?: string };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Impossible de charger les données.");
      if (servicesResponse) {
        const servicesPayload = (await servicesResponse.json()) as { payments?: PlanPayment[]; error?: string };
        if (servicesResponse.status === 401) {
          window.location.replace("/connexion");
          return;
        }
        if (!servicesResponse.ok) throw new Error(servicesPayload.error || "Impossible de charger les demandes de forfait.");
        const payments = servicesPayload.payments ?? [];
        setPendingPlanPayments(payments.filter((payment) => payment.status === "pending"));
        setPlanPaymentHistory(payments.filter((payment) => payment.status !== "pending"));
      }
      applyData(payload);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Impossible de charger les données.");
    }
  }, [applyData, role]);

  const loadMyMarketCatalogue = useCallback(async () => {
    try {
      setMyMarketLoading(true);
      setMyMarketError("");
      const response = await fetch(`/api/products/mymarket?lang=${language}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        products?: MyMarketProduct[];
        error?: string;
      };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok || !Array.isArray(payload.products)) {
        throw new Error(payload.error || "Catalogue MyMarket indisponible.");
      }
      setMyMarketProducts(payload.products);
      setMyMarketLoadedLanguage(language);
    } catch (error) {
      setMyMarketError(
        error instanceof Error ? error.message : "Catalogue MyMarket indisponible.",
      );
    } finally {
      setMyMarketLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  useEffect(() => {
    if (
      role !== "member" ||
      catalogSource !== "mymarket" ||
      myMarketLoadedLanguage === language
    ) {
      return;
    }
    const initialLoad = window.setTimeout(() => void loadMyMarketCatalogue(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [catalogSource, language, loadMyMarketCatalogue, myMarketLoadedLanguage, role]);

  useEffect(() => {
    const query = search.trim();
    const normalizedQuery = query.toLocaleLowerCase();
    const sequence = ++myMarketSearchSequence.current;

    if (role !== "member" || catalogSource !== "mymarket" || query.length < 2) {
      return;
    }

    const searchDelay = window.setTimeout(async () => {
      setMyMarketSearchingQuery(normalizedQuery);
      try {
        const parameters = new URLSearchParams({ lang: language, q: query });
        const response = await fetch(`/api/products/mymarket?${parameters.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          products?: MyMarketProduct[];
          error?: string;
        };
        if (response.status === 401) {
          window.location.replace("/connexion");
          return;
        }
        if (!response.ok || !Array.isArray(payload.products)) {
          throw new Error(payload.error || "Recherche MyMarket indisponible.");
        }
        if (myMarketSearchSequence.current === sequence) {
          setMyMarketRemoteSearch({ query: normalizedQuery, products: payload.products });
        }
      } catch {
        if (myMarketSearchSequence.current === sequence) {
          setMyMarketRemoteSearch({ query: normalizedQuery, products: [] });
        }
      } finally {
        if (myMarketSearchSequence.current === sequence) {
          setMyMarketSearchingQuery("");
        }
      }
    }, 300);

    return () => window.clearTimeout(searchDelay);
  }, [catalogSource, language, role, search]);

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
    const frame = window.requestAnimationFrame(() => {
      const savedLanguage = window.localStorage.getItem("family-expense-language");
      if (savedLanguage === "fr" || savedLanguage === "ar" || savedLanguage === "en") {
        setLanguage(savedLanguage);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const actService = async (body: Record<string, unknown>, success: string) => {
    try {
      setBusy(true);
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { payments?: PlanPayment[]; error?: string };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return false;
      }
      if (!response.ok) throw new Error(payload.error || "Action impossible.");
      const payments = payload.payments ?? [];
      setPendingPlanPayments(payments.filter((payment) => payment.status === "pending"));
      setPlanPaymentHistory(payments.filter((payment) => payment.status !== "pending"));
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
              products: [
                { ...product, has_orders: 0 },
                ...current.products.filter((entry) => entry.id !== product.id),
              ],
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
      setDraftAmounts((current) => {
        const updated = { ...current };
        delete updated[product.id];
        return updated;
      });
      toast.success(t.scannedAdded);
    },
    [t.scannedAdded],
  );

  const addMyMarketProduct = useCallback(
    async (source: MyMarketProduct, mode: "quantity" | "amount" = "quantity") => {
      try {
        setMyMarketBusyId(source.external_id);
        const response = await fetch("/api/products/mymarket", {
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
          throw new Error(payload.error || "Import MyMarket impossible.");
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
        if (mode === "amount") {
          setAmountProduct(product);
          setAmountDh(
            draftAmounts[product.id]
              ? (draftAmounts[product.id] / 100).toFixed(2)
              : "",
          );
          return;
        }
        setDraft((current) => ({
          ...current,
          [product.id]: (current[product.id] ?? 0) + 100,
        }));
        setDraftAmounts((current) => {
          const updated = { ...current };
          delete updated[product.id];
          return updated;
        });
        toast.success(t.myMarketAdded);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import MyMarket impossible.");
      } finally {
        setMyMarketBusyId(null);
      }
    },
    [draftAmounts, t.myMarketAdded],
  );

  const money = (cents: number) => {
    const locale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} ${language === "ar" ? "د.م." : "DH"}`;
  };

  const quantityLabel = (
    hundredths: number,
    unit: Product["unit"],
    packageSize?: string | null,
  ) => {
    const numberLocale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";
    const packageMatch = packageSize
      ?.trim()
      .match(/^(\d+(?:[.,]\d+)?)\s*(L|kg|pi(?:è|e)ces?)$/i);
    const packageUnit = packageMatch?.[2]?.toLocaleLowerCase();
    const matchingPackageUnit =
      packageUnit === unit.toLocaleLowerCase() ||
      (unit === "pièce" && packageUnit?.startsWith("pi"));
    const packageAmount = matchingPackageUnit
      ? Number(packageMatch?.[1]?.replace(",", ".") ?? 0)
      : 0;
    const amount = packageAmount > 0
      ? (hundredths / 100) * packageAmount
      : hundredths / 100;

    if (packageSize && !packageAmount) {
      const packageCount = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(amount);
      return amount === 1 ? packageSize : `${packageCount} × ${packageSize}`;
    }

    const translatedUnit =
      language === "ar"
        ? ({ L: "لتر", kg: "كلغ", "pièce": "قطعة" } as const)[unit]
        : language === "en"
          ? ({ L: "L", kg: "kg", "pièce": "piece" } as const)[unit]
          : unit;
    return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(amount)} ${translatedUnit}`;
  };

  const amountQuantityLabel = (
    amountCents: number,
    unitPriceCents: number,
    unit: Product["unit"],
    packageSize?: string | null,
  ) => {
    if (unitPriceCents <= 0) return "—";
    const measuredPackage = measuredPackageSize(packageSize);
    const displayUnit = measuredPackage?.unit ?? unit;
    const units =
      (amountCents / unitPriceCents) * (measuredPackage?.amount ?? 1);
    const numberLocale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";
    if (displayUnit === "kg" && units < 1) {
      return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(units * 1000)} g`;
    }
    if (displayUnit === "L" && units < 1) {
      return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(units * 1000)} ml`;
    }
    return quantityLabel(Math.round(units * 100), displayUnit);
  };

  const itemRequestLabel = (item: CartItem) =>
    isAmountItem(item)
      ? `${t.forAmount} ${money(item.quantity_hundredths)} · ≈ ${amountQuantityLabel(item.quantity_hundredths, item.catalog_unit_price_cents, item.unit, item.package_size)}`
      : quantityLabel(item.quantity_hundredths, item.unit, item.package_size);

  const itemsFor = (cartId: number) => data?.items.filter((item) => item.cart_id === cartId) ?? [];
  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLocaleLowerCase();
    const favoriteIds = new Set(data.favoriteProductIds);
    return data.products.filter((product) => {
      const categoryMatch = category === "all" || product.category === category;
      const favoriteMatch = !showFavorites || favoriteIds.has(product.id);
      const textMatch =
        !needle ||
        [product.name_fr, product.name_ar, product.name_en]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return categoryMatch && favoriteMatch && textMatch;
    });
  }, [category, data, search, showFavorites]);

  const filteredMyMarketProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const localMatches = myMarketProducts.filter((product) => {
      const categoryMatch = category === "all" || product.category === category;
      const textMatch = !needle || product.name.toLocaleLowerCase().includes(needle);
      return categoryMatch && textMatch;
    });
    if (!needle || myMarketRemoteSearch.query !== needle) return localMatches;

    const mergedMatches = new Map<string, MyMarketProduct>();
    for (const product of [...myMarketRemoteSearch.products, ...localMatches]) {
      if (category === "all" || product.category === category) {
        mergedMatches.set(product.external_id, product);
      }
    }
    return [...mergedMatches.values()];
  }, [category, myMarketProducts, myMarketRemoteSearch, search]);

  const visibleMyMarketProducts = filteredMyMarketProducts.slice(0, myMarketVisible);

  const draftProducts = Object.entries(draft)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({
      product: data?.products.find((product) => product.id === Number(id)),
      quantity,
    }))
    .filter((entry): entry is { product: Product; quantity: number } => Boolean(entry.product));

  const deliveryServiceFeeCents = data?.deliveryServiceFeeCents ?? 50;
  const draftTotal = draftProducts.reduce(
    (sum, entry) =>
      sum +
      (draftAmounts[entry.product.id] ??
        Math.round((entry.product.unit_price_cents * entry.quantity) / 100)),
    0,
  );
  const amountCentsPreview = Math.round(Number(amountDh.replace(",", ".")) * 100);
  const amountQuantityPreview =
    amountProduct && amountCentsPreview > 0
      ? amountQuantityLabel(
          amountCentsPreview,
          amountProduct.unit_price_cents,
          amountProduct.unit,
          amountProduct.package_size,
        )
      : "—";

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
        if (!staged.length && !missingProductsNote.trim()) {
          throw new Error("The visible cart is empty.");
        }
        const response = await fetch("/api/family", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "submit_cart",
            actorRole: "member",
            memberId: currentUser.id,
            items: staged,
            missingProductsNote,
          }),
        });
        const payload = (await response.json()) as AppData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "The cart could not be submitted.");
        applyData(payload);
        setDraft({});
        setMissingProductsNote("");
        setCartOpen(false);
        setMemberView("carts");
        await afterPaint();
        return {
          status: "visible_to_admin_and_delivery",
          memberId: currentUser.id,
          itemCount: staged.length,
          hasMissingProductsNote: Boolean(missingProductsNote.trim()),
        };
      },
    });

    return () => lifecycle.abort();
  }, [applyData, currentUser.id, data, draft, missingProductsNote, productName, role]);

  const addToCart = (product: Product) => {
    setDraftAmounts((current) => {
      const updated = { ...current };
      delete updated[product.id];
      return updated;
    });
    setDraft((current) => ({
      ...current,
      [product.id]: (current[product.id] ?? 0) + 100,
    }));
    toast.success(`${productName(product)} · +${quantityLabel(100, product.unit, product.package_size)}`);
  };

  const openAmountPicker = (product: Product) => {
    setAmountProduct(product);
    setAmountDh(draftAmounts[product.id] ? (draftAmounts[product.id] / 100).toFixed(2) : "");
  };

  const applyAmountToCart = () => {
    if (!amountProduct) return;
    const amountCents = Math.round(Number(amountDh.replace(",", ".")) * 100);
    if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 10_000_000) {
      toast.error(t.invalidAmount);
      return;
    }
    const estimatedHundredths = Math.max(
      1,
      Math.round((amountCents * 100) / amountProduct.unit_price_cents),
    );
    setDraft((current) => ({ ...current, [amountProduct.id]: estimatedHundredths }));
    setDraftAmounts((current) => ({ ...current, [amountProduct.id]: amountCents }));
    toast.success(`${productName(amountProduct)} · ${t.forAmount} ${money(amountCents)}`);
    setAmountProduct(null);
    setAmountDh("");
    setCartOpen(true);
  };

  const changeQuantity = (product: Product, direction: 1 | -1) => {
    const isMyMarketMeasuredProduct =
      product.external_source === "mymarket" &&
      (product.unit === "kg" ||
        product.unit === "L" ||
        /(?:kg|l)\s*$/i.test(product.package_size ?? ""));
    const step = isMyMarketMeasuredProduct
      ? 50
      : product.package_size || product.unit === "pièce"
        ? 100
        : 50;
    setDraftAmounts((current) => {
      const updated = { ...current };
      delete updated[product.id];
      return updated;
    });
    setDraft((current) => {
      const next = Math.max(0, (current[product.id] ?? 0) + direction * step);
      const updated = { ...current, [product.id]: next };
      if (!next) delete updated[product.id];
      return updated;
    });
  };

  const removeFromCart = (productId: number) => {
    setDraft((current) => {
      const updated = { ...current };
      delete updated[productId];
      return updated;
    });
    setDraftAmounts((current) => {
      const updated = { ...current };
      delete updated[productId];
      return updated;
    });
  };

  const submitCart = async () => {
    if (!draftProducts.length && !missingProductsNote.trim()) return;
    const payload = {
      action: editingCartId ? "update_cart" : "submit_cart",
      actorRole: "member",
      memberId: currentUser.id,
      ...(editingCartId ? { cartId: editingCartId } : {}),
      missingProductsNote,
      items: draftProducts.map(({ product, quantity }) => ({
        productId: product.id,
        quantityHundredths: quantity,
        ...(draftAmounts[product.id] ? { amountCents: draftAmounts[product.id] } : {}),
      })),
    };
    const ok = await act(payload, editingCartId ? "Panier mis à jour." : "Commande visible par l’admin et le livreur.");
    if (ok) {
      setDraft({});
      setDraftAmounts({});
      setMissingProductsNote("");
      setEditingCartId(null);
      setCartOpen(false);
      setMemberView("carts");
    }
  };

  const editCart = (cart: Cart) => {
    const cartItems = itemsFor(cart.id);
    setDraft(Object.fromEntries(cartItems.map((item) => [
      item.product_id,
      isAmountItem(item)
        ? Math.max(1, Math.round((item.quantity_hundredths * 100) / item.catalog_unit_price_cents))
        : item.quantity_hundredths,
    ])));
    setDraftAmounts(Object.fromEntries(cartItems.filter(isAmountItem).map((item) => [item.product_id, item.quantity_hundredths])));
    setMissingProductsNote(cart.missing_products_note);
    setEditingCartId(cart.id);
    setCartOpen(true);
  };

  const repeatCart = (cart: Cart) => {
    const repeatedItems = itemsFor(cart.id).filter((item) =>
      data?.products.some((product) => product.id === item.product_id),
    );
    if (!repeatedItems.length && !cart.missing_products_note.trim()) return;
    setDraft(
      Object.fromEntries(
        repeatedItems.map((item) => [
          item.product_id,
          isAmountItem(item)
            ? Math.max(1, Math.round((item.quantity_hundredths * 100) / item.catalog_unit_price_cents))
            : item.quantity_hundredths,
        ]),
      ),
    );
    setDraftAmounts(Object.fromEntries(repeatedItems.filter(isAmountItem).map((item) => [item.product_id, item.quantity_hundredths])));
    setMissingProductsNote(cart.missing_products_note);
    setEditingCartId(null);
    setCartOpen(true);
    setMemberView("catalog");
    toast.success(t.orderRepeated);
  };

  const toggleFavorite = (product: Product) => {
    const isFavorite = data?.favoriteProductIds.includes(product.id) ?? false;
    void act(
      { action: "toggle_favorite", actorRole: "member", productId: product.id },
      isFavorite ? t.favoriteRemoved : t.favoriteAdded,
    );
  };

  const parsePrice = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
  const pendingCarts =
    data?.carts.filter(
      (cart) => cart.priority === null && ["pending", "ready", "shopping"].includes(cart.status),
    ) ?? [];
  const pendingUsers = data?.pendingUsers ?? [];
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

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthlyTotal =
    data?.monthlyTotals.find((entry) => entry.month === currentMonth)?.total_cents ?? 0;
  const monthlyBudgetCents = data?.monthlyBudgetCents ?? 0;
  const budgetAlert =
    role !== "member" &&
    monthlyBudgetCents > 0 &&
    currentMonthlyTotal >= monthlyBudgetCents * 0.8;
  const notificationCount =
    (role === "admin"
      ? pendingCarts.length + pendingUsers.length + pendingPlanPayments.length
      : role === "delivery"
        ? deliveryQueue.length
        : memberActive.filter((cart) => cart.status !== "pending").length) +
    (budgetAlert ? 1 : 0);

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
        <div className="relative size-11 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(64,224,177,0.2)]">
          <Image src="/icons/icon-192.png" alt={t.brand} fill sizes="44px" className="object-cover" priority />
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
              <Button
                size="icon-lg"
                variant={memberView === "settings" ? "default" : "ghost"}
                className="rounded-2xl"
                onClick={() => setMemberView("settings")}
                aria-label={t.settings}
              >
                <Settings2 />
              </Button>
            </>
          )}
          {role === "admin" && <UserCog className="mt-3 size-6 text-primary" />}
          {role === "delivery" && <PackageCheck className="mt-3 size-6 text-primary" />}
          <Link href="/services" title="Missions maison">
            <Button size="icon-lg" variant="ghost" className="rounded-2xl" aria-label="Missions maison">
              <ClipboardCheck />
            </Button>
          </Link>
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-2xl border border-sidebar-border bg-sidebar-accent p-0.5 transition hover:border-sidebar-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={() => setProfileDialogOpen(true)}
          aria-label={t.editProfilePhoto}
          title={t.editProfilePhoto}
        >
          <ProfileAvatar
            user={currentUser}
            version={profileImageVersion}
            className="size-full rounded-[0.8rem] text-xs"
          />
        </button>
      </aside>

      <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] lg:ps-24 lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-background/88 px-3 py-3 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-3 max-[639px]:hidden">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-2xl lg:hidden">
                <Image src="/icons/icon-192.png" alt="" fill sizes="40px" className="object-cover" priority />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t.brand}</p>
                <p className="truncate text-sm text-muted-foreground">{roleNames[role][language]}</p>
              </div>
            </div>

            <div className="ms-auto flex items-center gap-1 sm:gap-2">
              {role === "member" && (
                <Link href="/abonnement" aria-label={`Forfait ${data.currentPlan}`}>
                  <Button
                    variant="outline"
                    className="h-11 rounded-full border-border bg-card/70 px-3 shadow-sm hover:bg-card sm:px-4"
                  >
                    <Crown className="size-4 text-[#e99a1b]" />
                    <span className="hidden min-[480px]:inline">Forfait</span>
                    <Badge className="ms-0.5 rounded-full px-2 uppercase">{data.currentPlan}</Badge>
                  </Button>
                </Link>
              )}
              {role !== "member" && (
                <Link href="/services">
                  <Button size="icon" variant="ghost" className="size-11 rounded-xl border border-border bg-card/70" aria-label="Missions maison" title="Missions maison">
                    <ClipboardCheck />
                  </Button>
                </Link>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-11 overflow-hidden rounded-xl border border-border bg-card/70 p-1 lg:hidden"
                onClick={() => setProfileDialogOpen(true)}
                aria-label={t.editProfilePhoto}
                title={t.editProfilePhoto}
              >
                <ProfileAvatar
                  user={currentUser}
                  version={profileImageVersion}
                  className="size-full rounded-lg text-[10px]"
                />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-11 rounded-xl border border-border bg-card/70"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? t.lightMode : t.darkMode}
                title={theme === "dark" ? t.lightMode : t.darkMode}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>

              <Select value={language} onValueChange={(value) => updateLanguage(value as Language)}>
                <SelectTrigger aria-label="Langue" className="h-11 w-11 rounded-xl border-border bg-card/70 px-3 sm:w-[7.2rem]">
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
                    size="icon"
                    variant="ghost"
                    className="relative size-11 rounded-xl border border-border bg-card/70"
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
                    {role === "admin" && (
                      <>
                        {pendingCarts.length} {t.awaiting.toLocaleLowerCase()} · {pendingUsers.length}{" "}
                        {t.accountRequests.toLocaleLowerCase()} · {pendingPlanPayments.length} demande{pendingPlanPayments.length > 1 ? "s" : ""} de forfait.
                      </>
                    )}
                    {role === "delivery" && `${deliveryQueue.length} ${t.carts.toLocaleLowerCase()}.`}
                    {role === "member" && `${notificationCount} ${t.carts.toLocaleLowerCase()} mis à jour.`}
                    {budgetAlert && (
                      <span className="mt-2 block font-medium text-[#b76500] dark:text-[#ffb454]">
                        {currentMonthlyTotal >= monthlyBudgetCents
                          ? t.budgetExceeded
                          : t.budgetWarning}
                      </span>
                    )}
                  </p>
                </PopoverContent>
              </Popover>

              <Button
                size="icon"
                variant="ghost"
                className={`size-11 rounded-xl border border-border bg-card/70 ${role === "member" ? "hidden sm:inline-flex" : ""}`}
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
                  className="h-11 rounded-xl px-2 sm:px-3"
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
                <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-4xl">
                  {memberView === "catalog" ? t.question : memberView === "carts" ? t.carts : t.settingsTitle}
                </h1>
                {memberView === "settings" && (
                  <p className="mt-2 text-sm text-muted-foreground sm:text-base">{t.settingsDescription}</p>
                )}
              </div>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card/70 px-4 text-sm font-medium">
                <ProfileAvatar
                  user={currentUser}
                  version={profileImageVersion}
                  className="size-6 rounded-lg text-[8px]"
                />
                {currentUser.name}
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
                      setMyMarketVisible(24);
                    }}
                  >
                    <ShoppingBasket /> {t.familyCatalog}
                  </Button>
                  <Button
                    variant={catalogSource === "mymarket" ? "default" : "ghost"}
                    className="rounded-xl"
                    aria-pressed={catalogSource === "mymarket"}
                    onClick={() => {
                      setCatalogSource("mymarket");
                      setMyMarketVisible(24);
                    }}
                  >
                    MyMarket
                  </Button>
                </div>

                <div className="mb-5 flex max-w-3xl gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute start-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setMyMarketVisible(24);
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
                        setMyMarketVisible(24);
                      }}
                    >
                      {t[key]}
                    </Button>
                  ))}
                  {catalogSource === "family" && (
                    <Button
                      variant={showFavorites ? "default" : "outline"}
                      className={showFavorites ? "h-10 rounded-full px-5" : "h-10 rounded-full border-border bg-card/65 px-5 text-muted-foreground"}
                      aria-pressed={showFavorites}
                      onClick={() => setShowFavorites((current) => !current)}
                    >
                      <Heart className={showFavorites ? "fill-current" : ""} />
                      {t.favorites}
                    </Button>
                  )}
                </div>

                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {catalogSource === "mymarket" ? t.myMarketCatalog : t.essentials}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {catalogSource === "mymarket" ? t.myMarketHint : t.estimated}
                    </p>
                    {catalogSource === "mymarket" && (
                      <p className="mt-1 text-xs font-medium text-primary">{t.myMarketRules}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="border-border bg-card/70 px-3 py-1.5 text-muted-foreground">
                    {catalogSource === "mymarket"
                      ? filteredMyMarketProducts.length
                      : filteredProducts.length}
                  </Badge>
                </div>

                {catalogSource === "family" ? (
                  filteredProducts.length ? (
                    <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
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
                              <div className="flex shrink-0 items-center gap-1">
                                {product.purchase_count >= 10 && (
                                  <Sparkles className="size-4 text-[#ffb454]" aria-label="Fréquent" />
                                )}
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="ghost"
                                  className={data.favoriteProductIds.includes(product.id) ? "text-destructive" : "text-muted-foreground"}
                                  aria-label={`${t.favorites}: ${productName(product)}`}
                                  aria-pressed={data.favoriteProductIds.includes(product.id)}
                                  disabled={busy}
                                  onClick={() => toggleFavorite(product)}
                                >
                                  <Heart className={data.favoriteProductIds.includes(product.id) ? "fill-current" : ""} />
                                </Button>
                              </div>
                            </div>
                            <Badge variant="outline" className="mb-3 border-border bg-muted/45 text-muted-foreground">
                              {product.package_size || `1 ${product.unit}`}
                            </Badge>
                            <div className="flex items-end justify-between gap-2">
                              <p className="text-lg font-bold tracking-tight sm:text-xl">
                                {product.unit_price_cents > 0 ? money(product.unit_price_cents) : t.priceToConfirm}
                              </p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {product.unit_price_cents > 0 &&
                                  ((product.unit !== "pièce" && !product.package_size) ||
                                    (product.external_source === "mymarket" &&
                                      measuredPackageSize(product.package_size))) && (
                                  <Button
                                    size="icon-sm"
                                    variant="outline"
                                    className="rounded-xl border-primary/25 text-primary"
                                    onClick={() => openAmountPicker(product)}
                                    aria-label={`${t.buyByAmount}: ${productName(product)}`}
                                    title={t.buyByAmount}
                                  >
                                    <WalletCards />
                                  </Button>
                                )}
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
                ) : myMarketLoading ? (
                  <div aria-label={t.myMarketLoading} className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 8 }, (_, index) => (
                      <div key={index} className="overflow-hidden rounded-[1.35rem] border border-border bg-card p-3">
                        <Skeleton className="aspect-[1.05] w-full rounded-2xl" />
                        <Skeleton className="mt-4 h-5 w-4/5" />
                        <Skeleton className="mt-3 h-8 w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : myMarketError ? (
                  <div className="rounded-3xl border border-dashed border-destructive/40 bg-card/60 p-10 text-center">
                    <AlertTriangle className="mx-auto mb-3 size-7 text-destructive" />
                    <p className="text-muted-foreground">{myMarketError}</p>
                    <Button className="mt-5 rounded-xl" onClick={() => void loadMyMarketCatalogue()}>
                      {t.retry}
                    </Button>
                  </div>
                ) : visibleMyMarketProducts.length ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                      {visibleMyMarketProducts.map((product) => (
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
                              <div className="flex shrink-0 items-center gap-1.5">
                                {measuredPackageSize(product.package_size) && (
                                  <Button
                                    size="icon-sm"
                                    variant="outline"
                                    className="rounded-xl border-primary/25 text-primary"
                                    disabled={myMarketBusyId === product.external_id}
                                    onClick={() => void addMyMarketProduct(product, "amount")}
                                    aria-label={`${t.buyByAmount}: ${product.name}`}
                                    title={t.buyByAmount}
                                  >
                                    {myMarketBusyId === product.external_id ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <WalletCards />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="icon-sm"
                                  className="rounded-xl"
                                  disabled={myMarketBusyId === product.external_id}
                                  onClick={() => void addMyMarketProduct(product)}
                                  aria-label={`${t.addProduct}: ${product.name}`}
                                >
                                  {myMarketBusyId === product.external_id ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Plus />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {visibleMyMarketProducts.length < filteredMyMarketProducts.length && (
                      <div className="mt-7 flex justify-center">
                        <Button
                          variant="outline"
                          className="rounded-xl bg-card"
                          onClick={() => setMyMarketVisible((current) => current + 24)}
                        >
                          {t.loadMore}
                        </Button>
                      </div>
                    )}
                  </>
                ) : myMarketSearching && search.trim().length >= 2 ? (
                  <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 size-7 animate-spin text-primary" />
                    {t.myMarketSearching}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center text-muted-foreground">
                    <Search className="mx-auto mb-3 size-7" />
                    {t.noProducts}
                  </div>
                )}
              </>
            ) : memberView === "carts" ? (
              <MemberCarts
                carts={memberActive}
                latestResult={latestMemberResult}
                itemsFor={itemsFor}
                productName={productName}
                itemRequestLabel={itemRequestLabel}
                money={money}
                statusText={statusText}
                t={t}
                busy={busy}
                onEdit={editCart}
                onRepeat={repeatCart}
                onCancel={(cart) =>
                  void act(
                    { action: "cancel_cart", actorRole: "member", cartId: cart.id, memberId: currentUser.id },
                    "Panier annulé.",
                  )
                }
              />
            ) : (
              <MemberSettings
                currentUser={currentUser}
                wallet={data.memberWallets.find((entry) => entry.member_id === currentUser.id) ?? null}
                money={money}
                language={language}
                setLanguage={updateLanguage}
                theme={theme}
                toggleTheme={toggleTheme}
                profileImageVersion={profileImageVersion}
                onEditProfile={() => setProfileDialogOpen(true)}
                t={t}
              />
            )}
          </section>
        )}

        {role === "admin" && (
          <AdminDashboard
            data={data}
            pendingCarts={pendingCarts}
            pendingUsers={pendingUsers}
            pendingPlanPayments={pendingPlanPayments}
            planPaymentHistory={planPaymentHistory}
            itemsFor={itemsFor}
            productName={productName}
            money={money}
            itemRequestLabel={itemRequestLabel}
            currentMonthlyTotal={currentMonthlyTotal}
            currentMonth={currentMonth}
            serviceFeeCents={deliveryServiceFeeCents}
            productPrices={productPrices}
            setProductPrices={setProductPrices}
            newProduct={newProduct}
            setNewProduct={setNewProduct}
            addDialogOpen={addDialogOpen}
            setAddDialogOpen={setAddDialogOpen}
            parsePrice={parsePrice}
            act={act}
            actService={actService}
            busy={busy}
            t={t}
            language={language}
            profileImageVersion={profileImageVersion}
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
            itemRequestLabel={itemRequestLabel}
            money={money}
            prices={deliveryPrices}
            setPrices={setDeliveryPrices}
            parsePrice={parsePrice}
            act={act}
            busy={busy}
            t={t}
            language={language}
            profileImageVersion={profileImageVersion}
            wallet={data.deliveryWallet}
            memberWallets={data.memberWallets}
            monthlyBudgetCents={monthlyBudgetCents}
            currentMonthlyTotal={currentMonthlyTotal}
            pushPublicKey={data.pushPublicKey}
          />
        )}
      </div>

      {role === "member" && (
        <nav aria-label="Navigation mobile" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 rounded-[1.4rem] border border-border bg-card/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.20)] backdrop-blur-xl lg:hidden">
          <Button
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-2xl ${memberView === "catalog" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}
            onClick={() => setMemberView("catalog")}
          >
            <ShoppingBasket className="size-5" /><span className="text-[11px]">{t.catalog}</span>
          </Button>
          <Link href="/services" className="flex">
            <Button variant="ghost" className="h-14 w-full flex-col gap-1 rounded-2xl text-muted-foreground">
              <ClipboardCheck className="size-5" /><span className="text-[11px]">Missions</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-2xl ${memberView === "carts" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}
            onClick={() => setMemberView("carts")}
          >
            <ListChecks className="size-5" /><span className="text-[11px]">{t.carts}</span>
          </Button>
          <Button
            variant="ghost"
            className={`h-14 flex-col gap-1 rounded-2xl ${memberView === "settings" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}
            onClick={() => setMemberView("settings")}
          >
            <Settings2 className="size-5" /><span className="text-[11px]">{t.settings}</span>
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

      <Dialog
        open={Boolean(amountProduct)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setAmountProduct(null);
            setAmountDh("");
          }
        }}
      >
        <DialogContent
          className="rounded-[1.75rem] border-border bg-card p-5 sm:max-w-md sm:p-6"
          dir={language === "ar" ? "rtl" : "ltr"}
          lang={language}
        >
          <DialogHeader className="pe-10">
            <DialogTitle>{t.buyByAmount}</DialogTitle>
            <DialogDescription>{t.amountHelp}</DialogDescription>
          </DialogHeader>
          {amountProduct && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3">
                <ProductImage
                  position={amountProduct.image_position}
                  imageUrl={amountProduct.image_url}
                  name={productName(amountProduct)}
                  className="size-14 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{productName(amountProduct)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {money(amountProduct.unit_price_cents)} / {amountProduct.package_size || amountProduct.unit}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="product-amount">{t.amountToSpend}</Label>
                <div className="relative mt-2">
                  <WalletCards className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-primary" />
                  <Input
                    id="product-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={amountDh}
                    onChange={(event) => setAmountDh(event.target.value)}
                    placeholder="5,00"
                    className="h-14 rounded-2xl ps-11 pe-14 text-lg font-bold"
                  />
                  <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">DH</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-primary/[0.07] px-4 py-3">
                <span className="text-sm text-muted-foreground">{t.estimatedQuantity}</span>
                <strong className="text-primary">≈ {amountQuantityPreview}</strong>
              </div>
              <Button
                className="h-12 w-full rounded-2xl"
                disabled={!Number.isInteger(amountCentsPreview) || amountCentsPreview < 50}
                onClick={applyAmountToCart}
              >
                <WalletCards /> {t.addForAmount}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent
          className="max-h-[94svh] overflow-y-auto rounded-[1.75rem] border-border bg-card p-5 sm:max-w-lg sm:p-6"
          dir={language === "ar" ? "rtl" : "ltr"}
          lang={language}
        >
          <DialogHeader className="pe-10">
            <DialogTitle>{t.profilePhoto}</DialogTitle>
            <DialogDescription>{t.profilePhotoDescription}</DialogDescription>
          </DialogHeader>
          <ProfilePhotoEditor
            user={currentUser}
            language={language}
            version={profileImageVersion}
            onChanged={setProfileImageVersion}
          />
        </DialogContent>
      </Dialog>

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
                  <div key={product.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-border bg-muted/45 p-3 min-[390px]:flex">
                    <ProductImage position={product.image_position} imageUrl={product.image_url} name={productName(product)} className="size-14 shrink-0 rounded-xl min-[390px]:size-16" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{productName(product)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {product.unit_price_cents > 0
                          ? `${money(product.unit_price_cents)} / ${product.package_size || product.unit}`
                          : t.priceToConfirm}
                      </p>
                    </div>
                    <div className="col-span-2 ms-auto flex w-full items-center justify-between gap-1 rounded-xl bg-background p-1 min-[390px]:w-auto">
                      {draftAmounts[product.id] ? (
                        <>
                          <Button size="icon-xs" variant="ghost" onClick={() => removeFromCart(product.id)} aria-label={t.removeImage}>
                            <X />
                          </Button>
                          <span className="min-w-24 text-center text-xs font-bold text-primary">
                            {t.forAmount} {money(draftAmounts[product.id])}
                          </span>
                          <Button size="icon-xs" variant="ghost" onClick={() => openAmountPicker(product)} aria-label={t.edit}>
                            <Pencil />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon-xs" variant="ghost" onClick={() => changeQuantity(product, -1)} aria-label="Réduire">
                            <X />
                          </Button>
                          <span className="min-w-12 text-center text-xs font-bold">{quantityLabel(quantity, product.unit, product.package_size)}</span>
                          <Button size="icon-xs" variant="ghost" onClick={() => changeQuantity(product, 1)} aria-label="Ajouter">
                            <Plus />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-40 place-items-center text-center">
                <div>
                  <ShoppingCart className="mx-auto mb-3 size-9 text-muted-foreground" />
                  <p className="text-muted-foreground">{t.emptyCart}</p>
                </div>
              </div>
            )}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="missing-products-note" className="text-sm font-semibold">
                  {t.missingProducts}
                </Label>
                <span className="text-xs text-muted-foreground">{t.optional}</span>
              </div>
              <Textarea
                id="missing-products-note"
                value={missingProductsNote}
                onChange={(event) => setMissingProductsNote(event.target.value)}
                maxLength={500}
                placeholder={t.missingProductsHint}
                className="min-h-28 resize-none rounded-2xl border-border bg-background text-base leading-6"
              />
              <p className="text-end text-xs text-muted-foreground">{missingProductsNote.length}/500</p>
            </div>
          </div>
          <SheetFooter className="border-t border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t.estimate}</span>
              <span className="font-medium">{money(draftTotal)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t.serviceFee}</span>
              <span className="font-medium">{money(deliveryServiceFeeCents)}</span>
            </div>
            <div className="mb-3 flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold">{t.totalWithService}</span>
              <strong className="text-xl">{money(draftTotal + deliveryServiceFeeCents)}</strong>
            </div>
            <Button
              size="lg"
              className="h-12 rounded-2xl"
              disabled={(!draftProducts.length && !missingProductsNote.trim()) || busy}
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

function MemberSettings({
  currentUser,
  wallet,
  money,
  language,
  setLanguage,
  theme,
  toggleTheme,
  profileImageVersion,
  onEditProfile,
  t,
}: {
  currentUser: FamilySessionUser;
  wallet: MemberWallet | null;
  money: (cents: number) => string;
  language: Language;
  setLanguage: (language: Language) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  profileImageVersion: number;
  onEditProfile: () => void;
  t: CopySet;
}) {
  const logout = () => {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      window.location.assign("/connexion");
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <article className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-6 lg:col-span-2">
        <div className="pointer-events-none absolute -end-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-5 md:grid-cols-[1fr_1.25fr] md:items-start">
          <div>
            <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <WalletCards className="size-5" />
            </span>
            <p className="text-sm font-medium text-muted-foreground">{t.memberBalance}</p>
            <p className={`mt-2 text-4xl font-black tracking-[-0.05em] ${wallet && wallet.balance_cents < 0 ? "text-destructive" : "text-foreground"}`}>
              {money(wallet?.balance_cents ?? 0)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {wallet && wallet.balance_cents < 0 ? t.negativeBalance : t.availableBalance}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/70 bg-card/75 p-3">
                <p className="text-xs text-muted-foreground">{t.moneyReceived}</p>
                <p className="mt-1 font-bold text-primary">+{money(wallet?.credited_cents ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/75 p-3">
                <p className="text-xs text-muted-foreground">{t.orderExpenses}</p>
                <p className="mt-1 font-bold">−{money(wallet?.spent_cents ?? 0)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/75 bg-card/80 p-4">
            <h2 className="font-semibold">{t.balanceHistory}</h2>
            <div className="mt-3 space-y-2">
              {wallet?.transactions.length ? wallet.transactions.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${entry.amount_cents > 0 ? "bg-primary/12 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {entry.type === "task" ? <Sparkles className="size-4" /> : entry.amount_cents > 0 ? <Plus className="size-4" /> : <ShoppingCart className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.type === "deposit" ? t.deposit : entry.type === "task" ? "Récompense de mission" : `${t.orderDebit} #${entry.cart_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA", { dateStyle: "medium" })}
                    </p>
                  </div>
                  <strong className={entry.amount_cents > 0 ? "text-primary" : "text-destructive"}>
                    {entry.amount_cents > 0 ? "+" : "−"}{money(Math.abs(entry.amount_cents))}
                  </strong>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{t.noBalanceHistory}</p>
              )}
            </div>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-border bg-card p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            className="group relative shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onEditProfile}
            aria-label={t.editProfilePhoto}
            title={t.editProfilePhoto}
          >
            <ProfileAvatar
              user={currentUser}
              version={profileImageVersion}
              className="size-14 rounded-2xl text-lg"
            />
            <span className="absolute -bottom-1 -end-1 grid size-6 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
              <Pencil className="size-3" />
            </span>
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{currentUser.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.member}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-muted/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t.username}
          </p>
          <p className="mt-2 break-all font-medium">@{currentUser.username}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-5 h-11 w-full rounded-xl border-destructive/25 text-destructive hover:bg-destructive/8 hover:text-destructive"
          onClick={logout}
        >
          <LogOut /> {t.logout}
        </Button>
      </article>

      <article className="rounded-[1.75rem] border border-border bg-card p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Settings2 className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t.appearance}</h2>
            <p className="text-sm text-muted-foreground">{t.settingsDescription}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Label className="mb-2.5 block">{t.languageSetting}</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.languageSetting}>
              {(Object.keys(languageNames) as Language[]).map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant={language === key ? "default" : "outline"}
                  className="min-w-0 rounded-xl px-2"
                  aria-pressed={language === key}
                  onClick={() => setLanguage(key)}
                >
                  <span className="truncate">{languageNames[key]}</span>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Label className="mb-2.5 block">{t.themeSetting}</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.themeSetting}>
              <Button
                type="button"
                variant={theme === "light" ? "default" : "outline"}
                className="rounded-xl"
                aria-pressed={theme === "light"}
                onClick={() => theme === "dark" && toggleTheme()}
              >
                <Sun /> {t.light}
              </Button>
              <Button
                type="button"
                variant={theme === "dark" ? "default" : "outline"}
                className="rounded-xl"
                aria-pressed={theme === "dark"}
                onClick={() => theme === "light" && toggleTheme()}
              >
                <Moon /> {t.dark}
              </Button>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function MemberBalancesManager({
  wallets,
  money,
  act,
  busy,
  t,
  language,
  actorRole,
}: {
  wallets: MemberWallet[];
  money: (cents: number) => string;
  act: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  busy: boolean;
  t: CopySet;
  language: Language;
  actorRole: "admin" | "delivery";
}) {
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  const addFunds = async (event: FormEvent, memberId: number) => {
    event.preventDefault();
    const raw = amounts[memberId] ?? "";
    const amountCents = Math.round(Number(raw.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      toast.error(t.invalidPrice);
      return;
    }
    const ok = await act(
      { action: "add_member_funds", actorRole, memberId, amountCents },
      t.fundsAdded,
    );
    if (ok) setAmounts((current) => ({ ...current, [memberId]: "" }));
  };

  return (
    <section className="rounded-3xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <WalletCards className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{t.memberBalances}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.memberBalancesHelp}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {wallets.map((wallet) => (
          <article key={wallet.member_id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-bold text-primary">
                {wallet.member_initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{wallet.member_name}</p>
                <p className="text-xs text-muted-foreground">{t.availableBalance}</p>
              </div>
              <strong className={`text-lg tabular-nums ${wallet.balance_cents < 0 ? "text-destructive" : "text-primary"}`}>
                {money(wallet.balance_cents)}
              </strong>
            </div>

            <form className="mt-4 flex gap-2" onSubmit={(event) => void addFunds(event, wallet.member_id)}>
              <div className="relative min-w-0 flex-1">
                <Input
                  inputMode="decimal"
                  value={amounts[wallet.member_id] ?? ""}
                  onChange={(event) => setAmounts((current) => ({ ...current, [wallet.member_id]: event.target.value }))}
                  placeholder="200.00"
                  className="h-10 rounded-xl pe-11"
                  aria-label={`${t.amount} · ${wallet.member_name}`}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DH</span>
              </div>
              <Button type="submit" className="h-10 rounded-xl" disabled={busy || !(amounts[wallet.member_id] ?? "").trim()}>
                <Plus className="size-4" /> <span className="hidden sm:inline">{t.addFunds}</span>
              </Button>
            </form>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{t.moneyReceived}: {money(wallet.credited_cents)}</span>
              <span>{t.orderExpenses}: {money(wallet.spent_cents)}</span>
            </div>
            {wallet.transactions[0] && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                <span className="truncate text-muted-foreground">
                  {wallet.transactions[0].type === "deposit"
                    ? t.deposit
                    : wallet.transactions[0].type === "task"
                      ? "Récompense de mission"
                      : `${t.orderDebit} #${wallet.transactions[0].cart_id}`} · {new Date(wallet.transactions[0].created_at).toLocaleDateString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA", { dateStyle: "medium" })}
                </span>
                <strong className={wallet.transactions[0].amount_cents > 0 ? "text-primary" : "text-destructive"}>
                  {wallet.transactions[0].amount_cents > 0 ? "+" : "−"}{money(Math.abs(wallet.transactions[0].amount_cents))}
                </strong>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function MemberCarts({
  carts,
  latestResult,
  itemsFor,
  productName,
  itemRequestLabel,
  money,
  statusText,
  t,
  busy,
  onEdit,
  onRepeat,
  onCancel,
}: {
  carts: Cart[];
  latestResult: Cart | null;
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  itemRequestLabel: (item: CartItem) => string;
  money: (cents: number) => string;
  statusText: Record<CartStatus, string>;
  t: CopySet;
  busy: boolean;
  onEdit: (cart: Cart) => void;
  onRepeat: (cart: Cart) => void;
  onCancel: (cart: Cart) => void;
}) {
  const statusStyles: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ready: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    shopping: "border-primary/25 bg-primary/10 text-primary",
    completed: "border-primary/25 bg-primary/10 text-primary",
  };
  const latestBoughtTotal = latestResult
    ? itemsFor(latestResult.id)
        .filter((item) => item.purchase_status === "bought")
        .reduce(
          (sum, item) =>
            sum + cartItemTotalCents(item),
          0,
        )
    : 0;

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
                    <span className="shrink-0 text-muted-foreground">{itemRequestLabel(item)}</span>
                  </div>
                ))}
              </div>
              <MissingProductsNote
                note={cart.missing_products_note}
                label={t.missingProducts}
                className="mt-3"
              />
              <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/[0.055] px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t.serviceFee}</span>
                <strong>{money(cart.service_fee_cents)}</strong>
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
                    {item.purchase_status === "bought" ? money(cartItemTotalCents(item)) : t.unbought}
                  </span>
                </div>
              ))}
            </div>
            <MissingProductsNote
              note={latestResult.missing_products_note}
              label={t.missingProducts}
              className="mt-3"
            />
            <div className="mt-4 space-y-2 border-t border-primary/15 pt-4 text-sm">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>{t.serviceFee}</span>
                <span>{money(latestResult.service_fee_cents)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 font-semibold">
                <span>{t.totalWithService}</span>
                <strong>{money(latestBoughtTotal + latestResult.service_fee_cents)}</strong>
              </div>
            </div>
            <Button
              className="mt-4 w-full rounded-xl"
              onClick={() => onRepeat(latestResult)}
            >
              <Repeat2 /> {t.repeatOrder}
            </Button>
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
  pendingUsers,
  pendingPlanPayments,
  planPaymentHistory,
  itemsFor,
  productName,
  money,
  itemRequestLabel,
  currentMonthlyTotal,
  currentMonth,
  serviceFeeCents,
  productPrices,
  setProductPrices,
  newProduct,
  setNewProduct,
  addDialogOpen,
  setAddDialogOpen,
  parsePrice,
  act,
  actService,
  busy,
  t,
  language,
  profileImageVersion,
}: {
  data: AppData;
  pendingCarts: Cart[];
  pendingUsers: PendingUser[];
  pendingPlanPayments: PlanPayment[];
  planPaymentHistory: PlanPayment[];
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  money: (cents: number) => string;
  itemRequestLabel: (item: CartItem) => string;
  currentMonthlyTotal: number;
  currentMonth: string;
  serviceFeeCents: number;
  productPrices: Record<number, string>;
  setProductPrices: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  newProduct: ProductFormDraft;
  setNewProduct: React.Dispatch<React.SetStateAction<ProductFormDraft>>;
  addDialogOpen: boolean;
  setAddDialogOpen: (value: boolean) => void;
  parsePrice: (value: string) => number;
  act: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  actService: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  busy: boolean;
  t: CopySet;
  language: Language;
  profileImageVersion: number;
}) {
  const [newProductImage, setNewProductImage] = useState<File | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<ProductFormDraft>({
    nameFr: "",
    nameAr: "",
    nameEn: "",
    category: "food",
    unit: "pièce",
    price: "",
  });
  const [editProductImage, setEditProductImage] = useState<File | null>(null);
  const [removeEditProductImage, setRemoveEditProductImage] = useState(false);
  const [productToRemove, setProductToRemove] = useState<Product | null>(null);
  const [memberToReject, setMemberToReject] = useState<PendingUser | null>(null);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [budgetInput, setBudgetInput] = useState(
    data.monthlyBudgetCents ? (data.monthlyBudgetCents / 100).toFixed(2) : "",
  );
  const [settleWalletOpen, setSettleWalletOpen] = useState(false);
  const [planPushState, setPlanPushState] = useState<"checking" | "disabled" | "enabled" | "blocked" | "unavailable" | "working">("checking");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const newProductImagePreview = useMemo(
    () => (newProductImage ? URL.createObjectURL(newProductImage) : null),
    [newProductImage],
  );
  const editProductImagePreview = useMemo(
    () => (editProductImage ? URL.createObjectURL(editProductImage) : null),
    [editProductImage],
  );

  useEffect(
    () => () => {
      if (newProductImagePreview) URL.revokeObjectURL(newProductImagePreview);
    },
    [newProductImagePreview],
  );

  useEffect(
    () => () => {
      if (editProductImagePreview) URL.revokeObjectURL(editProductImagePreview);
    },
    [editProductImagePreview],
  );

  useEffect(() => {
    let cancelled = false;
    const checkSubscription = async () => {
      if (!data.pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setPlanPushState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setPlanPushState("blocked");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/family-sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setPlanPushState(subscription ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setPlanPushState("unavailable");
      }
    };
    void checkSubscription();
    return () => { cancelled = true; };
  }, [data.pushPublicKey]);

  const clearNewProductImage = () => {
    setNewProductImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const selectProductImage = (
    event: React.ChangeEvent<HTMLInputElement>,
    setImage: (image: File | null) => void,
  ) => {
    const image = event.currentTarget.files?.[0] ?? null;
    if (!image) {
      setImage(null);
      return;
    }
    if (!PRODUCT_IMAGE_TYPES.includes(image.type)) {
      toast.error(t.imageInvalid);
      event.currentTarget.value = "";
      return;
    }
    if (image.size > MAX_PRODUCT_IMAGE_BYTES) {
      toast.error(t.imageTooLarge);
      event.currentTarget.value = "";
      return;
    }
    setImage(image);
  };

  const uploadProductImage = async (image: File) => {
    const formData = new FormData();
    formData.set("image", image);
    const uploadResponse = await fetch("/api/products/images", {
      method: "POST",
      body: formData,
    });
    const uploadPayload = (await uploadResponse.json().catch(() => ({}))) as {
      imageUrl?: string;
      error?: string;
    };
    if (uploadResponse.status === 401) {
      window.location.replace("/connexion");
      return null;
    }
    if (!uploadResponse.ok || !uploadPayload.imageUrl) {
      throw new Error(uploadPayload.error || "Envoi de l’image impossible.");
    }
    return uploadPayload.imageUrl;
  };

  const openProductEditor = (product: Product) => {
    setEditProduct({
      nameFr: product.name_fr,
      nameAr: product.name_ar,
      nameEn: product.name_en,
      category: product.category,
      unit: product.unit,
      price: (product.unit_price_cents / 100).toFixed(2),
    });
    setEditProductImage(null);
    setRemoveEditProductImage(false);
    if (editImageInputRef.current) editImageInputRef.current.value = "";
    setEditingProduct(product);
  };

  const closeProductEditor = () => {
    setEditingProduct(null);
    setEditProductImage(null);
    setRemoveEditProductImage(false);
    if (editImageInputRef.current) editImageInputRef.current.value = "";
  };

  const submitNewProduct = async (event: FormEvent) => {
    event.preventDefault();
    const unitPriceCents = parsePrice(newProduct.price);
    if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
      toast.error(t.invalidPrice);
      return;
    }

    let uploadedImageUrl = "";
    setImageUploadBusy(true);
    try {
      if (newProductImage) {
        const imageUrl = await uploadProductImage(newProductImage);
        if (!imageUrl) return;
        uploadedImageUrl = imageUrl;
      }

      const ok = await act(
        {
          action: "add_product",
          actorRole: "admin",
          ...newProduct,
          imageUrl: uploadedImageUrl || null,
          unitPriceCents,
        },
        "Produit ajouté.",
      );
      if (ok) {
        setAddDialogOpen(false);
        setNewProduct({ nameFr: "", nameAr: "", nameEn: "", category: "food", unit: "pièce", price: "" });
        clearNewProductImage();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi de l’image impossible.");
    } finally {
      setImageUploadBusy(false);
    }
  };

  const submitEditedProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingProduct) return;
    const unitPriceCents = parsePrice(editProduct.price);
    if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
      toast.error(t.invalidPrice);
      return;
    }

    setImageUploadBusy(true);
    try {
      const uploadedImageUrl = editProductImage
        ? await uploadProductImage(editProductImage)
        : null;
      if (editProductImage && !uploadedImageUrl) return;

      const ok = await act(
        {
          action: "edit_product",
          actorRole: "admin",
          productId: editingProduct.id,
          ...editProduct,
          unitPriceCents,
          removeImage: removeEditProductImage,
          ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
        },
        "Produit mis à jour.",
      );
      if (ok) closeProductEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi de l’image impossible.");
    } finally {
      setImageUploadBusy(false);
    }
  };

  const removeProduct = async () => {
    const product = productToRemove;
    if (!product) return;
    const ok = await act(
      { action: "remove_product", actorRole: "admin", productId: product.id },
      "Produit supprimé du catalogue.",
    );
    if (ok) setProductToRemove(null);
  };

  const rejectPendingUser = async () => {
    if (!memberToReject) return;
    const ok = await act(
      { action: "reject_user", userId: memberToReject.id },
      t.accountRejected,
    );
    if (ok) setMemberToReject(null);
  };

  const saveMonthlyBudget = async (event: FormEvent) => {
    event.preventDefault();
    const budgetCents = budgetInput.trim() ? parsePrice(budgetInput) : 0;
    if (!Number.isInteger(budgetCents) || budgetCents < 0) {
      toast.error(t.invalidPrice);
      return;
    }
    await act(
      { action: "set_monthly_budget", actorRole: "admin", budgetCents },
      t.budgetSaved,
    );
  };

  const settleDeliveryWallet = async () => {
    const ok = await act(
      { action: "settle_delivery_wallet", actorRole: "admin" },
      t.walletSettled,
    );
    if (ok) setSettleWalletOpen(false);
  };

  const togglePlanPushNotifications = async () => {
    if (!data.pushPublicKey || planPushState === "working") return;
    try {
      setPlanPushState("working");
      const registration = await navigator.serviceWorker.register("/family-sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const saved = await act(
          { action: "unsubscribe_push", actorRole: "admin", endpoint: existing.endpoint },
          "Notifications de forfait désactivées.",
        );
        if (!saved) {
          setPlanPushState("enabled");
          return;
        }
        await existing.unsubscribe();
        setPlanPushState("disabled");
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setPlanPushState("blocked");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(data.pushPublicKey),
      });
      const saved = await act(
        { action: "subscribe_push", actorRole: "admin", subscription: subscription.toJSON() },
        "Notifications de forfait activées.",
      );
      if (!saved) {
        await subscription.unsubscribe();
        setPlanPushState("disabled");
        return;
      }
      setPlanPushState("enabled");
    } catch {
      setPlanPushState(Notification.permission === "denied" ? "blocked" : "unavailable");
      toast.error("Notifications indisponibles sur cet appareil.");
    }
  };

  const budgetRatio =
    data.monthlyBudgetCents > 0 ? currentMonthlyTotal / data.monthlyBudgetCents : 0;
  const budgetRemaining = Math.max(data.monthlyBudgetCents - currentMonthlyTotal, 0);

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
            {pendingCarts.length + pendingUsers.length + pendingPlanPayments.length > 0 && (
              <Badge className="ms-1 h-5 min-w-5 px-1.5">{pendingCarts.length + pendingUsers.length + pendingPlanPayments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="products" className="h-9 rounded-xl px-4"><PackagePlus /> {t.products}</TabsTrigger>
          <TabsTrigger value="balances" className="h-9 rounded-xl px-4"><WalletCards /> {t.balances}</TabsTrigger>
          <TabsTrigger value="analytics" className="h-9 rounded-xl px-4"><BarChart3 /> {t.analytics}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="mb-8 rounded-3xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                <UserPlus className="size-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{t.accountRequests}</h2>
                  {pendingUsers.length > 0 && <Badge>{pendingUsers.length}</Badge>}
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.accountRequestsHelp}</p>
              </div>
            </div>

            {pendingUsers.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {pendingUsers.map((member) => (
                  <article key={member.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-bold text-primary">
                      {member.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.requestedOn}{" "}
                        {new Date(member.created_at).toLocaleString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                      <Button
                        variant="outline"
                        className="h-10 min-w-0 rounded-xl px-3 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setMemberToReject(member)}
                      >
                        <X /> {t.rejectAccount}
                      </Button>
                      <Button
                        className="h-10 min-w-0 rounded-xl px-3"
                        disabled={busy}
                        onClick={() => void act({ action: "approve_user", userId: member.id }, t.accountApproved)}
                      >
                        <UserCheck /> {t.approveAccount}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-center text-sm text-muted-foreground">
                <UserCheck className="mx-auto mb-2 size-6 text-primary" />
                {t.noAccountRequests}
              </div>
            )}
          </div>

          <div className="mb-8 rounded-3xl border border-[#f3a72f]/35 bg-[#f3a72f]/[0.06] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#f3a72f]/15 text-[#c57900] dark:text-[#ffbd57]">
                <Crown className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">Demandes de forfait</h2>
                  {pendingPlanPayments.length > 0 && <Badge className="bg-[#f3a72f] text-[#2d1e07] hover:bg-[#f3a72f]">{pendingPlanPayments.length}</Badge>}
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Confirmez uniquement après avoir reçu le montant indiqué.</p>
              </div>
              <Button
                variant={planPushState === "enabled" ? "outline" : "default"}
                className="rounded-xl sm:shrink-0"
                disabled={planPushState === "checking" || planPushState === "working" || planPushState === "blocked" || planPushState === "unavailable"}
                onClick={() => void togglePlanPushNotifications()}
              >
                {planPushState === "working" ? <Loader2 className="animate-spin" /> : <BellRing />}
                {planPushState === "enabled" ? "Désactiver les alertes" : planPushState === "blocked" ? "Alertes bloquées" : planPushState === "unavailable" ? "Alertes indisponibles" : "M’alerter hors du site"}
              </Button>
            </div>

            {pendingPlanPayments.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {pendingPlanPayments.map((payment) => (
                  <article key={payment.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{payment.user_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {payment.request_type === "trial" ? "Essai personnel gratuit · 7 jours" : payment.scope === "family" ? "Participation au forfait familial" : "Forfait personnel"} · <span className="font-bold uppercase">{payment.plan}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(payment.created_at).toLocaleString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                      <strong className="shrink-0 text-lg text-primary">{payment.request_type === "trial" ? "GRATUIT" : money(payment.amount_cents)}</strong>
                    </div>
                    {payment.proof_key && (
                      <a
                        href={`/api/services/proofs?paymentId=${encodeURIComponent(payment.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                      >
                        <ReceiptText className="size-4" />
                        Voir le justificatif{payment.proof_name ? ` · ${payment.proof_name}` : ""}
                      </a>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => void actService({ action: "reject_payment", paymentId: payment.id }, "Demande de forfait refusée.")}
                      >
                        <X /> Refuser
                      </Button>
                      <Button
                        className="rounded-xl"
                        disabled={busy}
                        onClick={() => void actService({ action: "confirm_payment", paymentId: payment.id }, payment.request_type === "trial" ? "Essai approuvé et activé pour 7 jours." : "Paiement confirmé et forfait activé.")}
                      >
                        <Check /> {payment.request_type === "trial" ? "Approuver" : "Confirmer"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-center text-sm text-muted-foreground">
                <CircleCheck className="mx-auto mb-2 size-6 text-primary" />
                Aucune demande de forfait en attente.
              </div>
            )}
            <details className="mt-4 rounded-2xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold">
                <ReceiptText className="size-4 text-primary" />
                Historique des forfaits
                <Badge variant="outline" className="ms-auto">{planPaymentHistory.length}</Badge>
              </summary>
              <div className="max-h-80 space-y-2 overflow-y-auto border-t border-border p-3">
                {planPaymentHistory.length ? planPaymentHistory.map((payment) => (
                  <article key={payment.id} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{payment.user_name} · {payment.request_type === "trial" ? "ESSAI PRO" : payment.plan.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.scope === "family" ? "Familial" : "Personnel"} · {new Date(payment.created_at).toLocaleDateString(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-MA")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {payment.proof_key && <a href={`/api/services/proofs?paymentId=${encodeURIComponent(payment.id)}`} target="_blank" rel="noreferrer" aria-label={`Voir le justificatif de ${payment.user_name}`} className="rounded-lg p-2 text-primary hover:bg-primary/10"><ReceiptText className="size-4" /></a>}
                      <strong className="text-sm">{payment.request_type === "trial" ? "GRATUIT" : money(payment.amount_cents)}</strong>
                      <Badge variant={payment.status === "confirmed" ? "default" : "outline"} className={payment.status === "rejected" ? "border-destructive/30 text-destructive" : ""}>{payment.status === "confirmed" ? "Confirmé" : "Refusé"}</Badge>
                    </div>
                  </article>
                )) : <p className="py-5 text-center text-sm text-muted-foreground">Aucun historique pour le moment.</p>}
              </div>
            </details>
          </div>

          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t.awaiting}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.choosePriority}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingCarts.length ? pendingCarts.map((cart) => (
              <article key={cart.id} className="rounded-3xl border border-border bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ProfileAvatar
                      user={{ id: cart.member_id, name: cart.member_name, initials: cart.member_initials }}
                      version={profileImageVersion}
                      className="size-11 rounded-2xl text-sm"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold">{cart.member_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cart.submitted_at).toLocaleString(language === "ar" ? "ar-MA" : "fr-MA", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    {itemsFor(cart.id).length} {t.items}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {itemsFor(cart.id).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5 text-sm">
                      <span className="truncate">{productName(item)}</span>
                      <span className="shrink-0 text-muted-foreground">{itemRequestLabel(item)}</span>
                    </div>
                  ))}
                </div>
                <MissingProductsNote
                  note={cart.missing_products_note}
                  label={t.missingProducts}
                  className="mt-3"
                />
                <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/[0.055] px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t.serviceFee}</span>
                  <strong>{money(serviceFeeCents)}</strong>
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

        <TabsContent value="balances">
          <MemberBalancesManager
            wallets={data.memberWallets}
            money={money}
            act={act}
            busy={busy}
            t={t}
            language={language}
            actorRole="admin"
          />
        </TabsContent>

        <TabsContent value="products">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{t.products}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.products.length} produits actifs</p>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl"><Plus /> {t.addProduct}</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto rounded-3xl border-border bg-card">
                <form onSubmit={(event) => void submitNewProduct(event)}>
                  <DialogHeader>
                    <DialogTitle>{t.addProduct}</DialogTitle>
                    <DialogDescription>Les trois langues sont prêtes dès maintenant.</DialogDescription>
                  </DialogHeader>
                  <div className="my-6 grid gap-4">
                    <div className="grid gap-2">
                      <p className="text-sm font-medium">{t.productImage}</p>
                      <label
                        htmlFor="new-product-image"
                        className="group relative grid min-h-36 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-primary/35 bg-primary/[0.035] text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.065]"
                      >
                        {newProductImagePreview ? (
                          <>
                            <span
                              role="img"
                              aria-label={newProduct.nameFr || t.productImage}
                              className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                              style={{ backgroundImage: `url("${newProductImagePreview}")` }}
                            />
                            <span className="absolute inset-x-3 bottom-3 rounded-xl bg-background/90 px-3 py-2 text-sm font-medium shadow-sm backdrop-blur">
                              {t.changeImage}
                            </span>
                          </>
                        ) : (
                          <span className="grid justify-items-center gap-2 px-4 py-6 text-sm font-medium text-primary">
                            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10">
                              <ImagePlus className="size-5" />
                            </span>
                            {t.chooseImage}
                          </span>
                        )}
                      </label>
                      <input
                        ref={imageInputRef}
                        id="new-product-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-describedby="new-product-image-hint"
                        onChange={(event) => selectProductImage(event, setNewProductImage)}
                      />
                      <div className="flex min-h-8 items-center justify-between gap-3">
                        <p id="new-product-image-hint" className="text-xs text-muted-foreground">
                          {t.imageHint}
                        </p>
                        {newProductImage && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-lg text-muted-foreground"
                            disabled={imageUploadBusy}
                            onClick={clearNewProductImage}
                          >
                            <Trash2 className="size-4" /> {t.removeImage}
                          </Button>
                        )}
                      </div>
                    </div>
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
                    <Button type="submit" disabled={busy || imageUploadBusy} className="rounded-xl">{(busy || imageUploadBusy) && <Loader2 className="animate-spin" />}{t.save}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {data.products.map((product) => (
              <article key={product.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-3">
                <ProductImage position={product.image_position} imageUrl={product.image_url} name={productName(product)} className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{productName(product)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.package_size || `1 ${product.unit}`} · {t[product.category as keyof CopySet] ?? product.category}
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-2 border-t border-border/70 pt-3 xl:w-auto xl:border-0 xl:pt-0">
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
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-xl border-border"
                    disabled={busy || imageUploadBusy}
                    onClick={() => openProductEditor(product)}
                    aria-label={`${t.editProduct}: ${productName(product)}`}
                    title={t.editProduct}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy || imageUploadBusy}
                    onClick={() => setProductToRemove(product)}
                    aria-label={`${t.deleteProduct}: ${productName(product)}`}
                    title={t.deleteProduct}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <Dialog
            open={Boolean(editingProduct)}
            onOpenChange={(open) => {
              if (!open && !busy && !imageUploadBusy) closeProductEditor();
            }}
          >
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto rounded-3xl border-border bg-card">
              {editingProduct && (
                <form onSubmit={(event) => void submitEditedProduct(event)}>
                  <DialogHeader>
                    <DialogTitle>{t.editProduct}</DialogTitle>
                    <DialogDescription>{productName(editingProduct)}</DialogDescription>
                  </DialogHeader>
                  <div className="my-6 grid gap-4">
                    <div className="grid gap-2">
                      <p className="text-sm font-medium">{t.productImage}</p>
                      <label
                        htmlFor="edit-product-image"
                        className="group relative grid min-h-36 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-primary/35 bg-primary/[0.035] text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.065]"
                      >
                        {editProductImagePreview ? (
                          <>
                            <span
                              role="img"
                              aria-label={editProduct.nameFr || t.productImage}
                              className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                              style={{ backgroundImage: `url("${editProductImagePreview}")` }}
                            />
                            <span className="absolute inset-x-3 bottom-3 rounded-xl bg-background/90 px-3 py-2 text-sm font-medium shadow-sm backdrop-blur">
                              {t.changeImage}
                            </span>
                          </>
                        ) : !removeEditProductImage &&
                          (editingProduct.image_url || editingProduct.image_position !== "none") ? (
                          <>
                            <ProductImage
                              position={editingProduct.image_position}
                              imageUrl={editingProduct.image_url}
                              name={editProduct.nameFr || productName(editingProduct)}
                              className="absolute inset-0"
                            />
                            <span className="absolute inset-x-3 bottom-3 rounded-xl bg-background/90 px-3 py-2 text-sm font-medium shadow-sm backdrop-blur">
                              {t.changeImage}
                            </span>
                          </>
                        ) : (
                          <span className="grid justify-items-center gap-2 px-4 py-6 text-sm font-medium text-primary">
                            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10">
                              <ImagePlus className="size-5" />
                            </span>
                            {t.chooseImage}
                          </span>
                        )}
                      </label>
                      <input
                        ref={editImageInputRef}
                        id="edit-product-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-describedby="edit-product-image-hint"
                        onChange={(event) => {
                          selectProductImage(event, (image) => {
                            setEditProductImage(image);
                            if (image) setRemoveEditProductImage(false);
                          });
                        }}
                      />
                      <div className="flex min-h-8 items-center justify-between gap-3">
                        <p id="edit-product-image-hint" className="text-xs text-muted-foreground">
                          {t.imageHint}
                        </p>
                        {(editProductImage ||
                          (!removeEditProductImage &&
                            (editingProduct.image_url || editingProduct.image_position !== "none"))) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-lg text-muted-foreground"
                            disabled={imageUploadBusy}
                            onClick={() => {
                              setEditProductImage(null);
                              setRemoveEditProductImage(true);
                              if (editImageInputRef.current) editImageInputRef.current.value = "";
                            }}
                          >
                            <Trash2 className="size-4" /> {t.removeImage}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="edit-name-fr">Nom français</Label><Input id="edit-name-fr" required value={editProduct.nameFr} onChange={(event) => setEditProduct((current) => ({ ...current, nameFr: event.target.value }))} /></div>
                    <div className="grid gap-2"><Label htmlFor="edit-name-ar">Nom arabe</Label><Input id="edit-name-ar" dir="rtl" value={editProduct.nameAr} onChange={(event) => setEditProduct((current) => ({ ...current, nameAr: event.target.value }))} /></div>
                    <div className="grid gap-2"><Label htmlFor="edit-name-en">Nom anglais</Label><Input id="edit-name-en" value={editProduct.nameEn} onChange={(event) => setEditProduct((current) => ({ ...current, nameEn: event.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label>Catégorie</Label>
                        <Select value={editProduct.category} onValueChange={(value) => setEditProduct((current) => ({ ...current, category: value }))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{categoryKeys.slice(1).map((key) => <SelectItem key={key} value={key}>{t[key]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Unité</Label>
                        <Select disabled={Boolean(editingProduct.has_orders)} value={editProduct.unit} onValueChange={(value) => setEditProduct((current) => ({ ...current, unit: value }))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="L">Litre</SelectItem><SelectItem value="kg">kg</SelectItem><SelectItem value="pièce">Pièce</SelectItem></SelectContent>
                        </Select>
                        {Boolean(editingProduct.has_orders) && <p className="text-xs text-muted-foreground">{t.unitLocked}</p>}
                      </div>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="edit-price">{t.price} (DH)</Label><Input id="edit-price" inputMode="decimal" required value={editProduct.price} onChange={(event) => setEditProduct((current) => ({ ...current, price: event.target.value }))} /></div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" disabled={busy || imageUploadBusy} className="rounded-xl" onClick={closeProductEditor}>{t.cancel}</Button>
                    <Button type="submit" disabled={busy || imageUploadBusy} className="rounded-xl">{(busy || imageUploadBusy) && <Loader2 className="animate-spin" />}{t.save}</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <AlertDialog open={Boolean(productToRemove)} onOpenChange={(open) => !open && setProductToRemove(null)}>
            <AlertDialogContent className="rounded-3xl border-border bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t.deleteProduct}{productToRemove ? ` · ${productName(productToRemove)}` : ""}
                </AlertDialogTitle>
                <AlertDialogDescription>{t.deleteProductHelp}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void removeProduct()}
                >
                  {busy && <Loader2 className="animate-spin" />}
                  {t.confirmDelete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-5 lg:grid-cols-2">
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
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <PiggyBank className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{t.budget}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.monthlyBudget}</p>
                </div>
              </div>
              <form className="mt-5 flex gap-2" onSubmit={(event) => void saveMonthlyBudget(event)}>
                <div className="relative min-w-0 flex-1">
                  <Input
                    inputMode="decimal"
                    value={budgetInput}
                    onChange={(event) => setBudgetInput(event.target.value)}
                    placeholder="3000.00"
                    className="h-11 rounded-xl pe-12"
                    aria-label={t.monthlyBudget}
                  />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DH</span>
                </div>
                <Button type="submit" className="h-11 rounded-xl" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  <span className="hidden sm:inline">{t.setBudget}</span>
                </Button>
              </form>
              {data.monthlyBudgetCents > 0 ? (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <strong>{money(currentMonthlyTotal)}</strong>
                    <span className="text-muted-foreground">/ {money(data.monthlyBudgetCents)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${budgetRatio >= 1 ? "bg-destructive" : budgetRatio >= 0.8 ? "bg-[#d98200]" : "bg-primary"}`}
                      style={{ width: `${Math.min(budgetRatio * 100, 100)}%` }}
                    />
                  </div>
                  <p className={`mt-3 text-xs font-medium ${budgetRatio >= 0.8 ? "text-[#b76500] dark:text-[#ffb454]" : "text-muted-foreground"}`}>
                    {budgetRatio >= 1
                      ? t.budgetExceeded
                      : budgetRatio >= 0.8
                        ? t.budgetWarning
                        : `${t.budgetRemaining}: ${money(budgetRemaining)}`}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">{t.budgetNotSet}</p>
              )}
            </article>

            <article className="rounded-[2rem] border border-border bg-card p-6">
              <div className="mb-5 flex flex-wrap items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <WalletCards className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.wallet}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.deliveryWallet.completedOrders} {t.completedOrders}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  [t.earned, data.deliveryWallet.earnedCents],
                  [t.paid, data.deliveryWallet.paidCents],
                  [t.unpaid, data.deliveryWallet.unpaidCents],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0 rounded-2xl bg-muted/45 p-3">
                    <p className="truncate text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 truncate font-bold tabular-nums">{money(Number(value))}</p>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full rounded-xl border-primary/25 text-primary"
                disabled={busy || data.deliveryWallet.unpaidCents <= 0}
                onClick={() => setSettleWalletOpen(true)}
              >
                <Check /> {t.settleWallet}
              </Button>
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
          <AdminAnalyticsCharts
            language={language}
            currentMonth={currentMonth}
            users={data.users}
            products={data.products}
            carts={data.carts}
            items={data.items}
            serviceFeeCents={serviceFeeCents}
            formatMoney={money}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={settleWalletOpen}
        onOpenChange={(open) => !busy && setSettleWalletOpen(open)}
      >
        <AlertDialogContent className="rounded-3xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settleWallet}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settleWalletHelp} {money(data.deliveryWallet.unpaidCents)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || data.deliveryWallet.unpaidCents <= 0}
              onClick={(event) => {
                event.preventDefault();
                void settleDeliveryWallet();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {t.settleWallet}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(memberToReject)}
        onOpenChange={(open) => !open && !busy && setMemberToReject(null)}
      >
        <AlertDialogContent className="rounded-3xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.rejectAccountTitle}{memberToReject ? ` · ${memberToReject.name}` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>{t.rejectAccountHelp}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.keepRequest}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void rejectPendingUser();
              }}
            >
              {busy && <Loader2 className="animate-spin" />}
              {t.rejectAccount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  itemRequestLabel,
  money,
  prices,
  setPrices,
  parsePrice,
  act,
  busy,
  t,
  language,
  profileImageVersion,
  wallet,
  memberWallets,
  monthlyBudgetCents,
  currentMonthlyTotal,
  pushPublicKey,
}: {
  queue: Cart[];
  history: Cart[];
  view: "queue" | "history" | "balances";
  setView: (view: "queue" | "history" | "balances") => void;
  itemsFor: (cartId: number) => CartItem[];
  productName: (product: Pick<Product, "name_fr" | "name_ar" | "name_en">) => string;
  itemRequestLabel: (item: CartItem) => string;
  money: (cents: number) => string;
  prices: Record<number, string>;
  setPrices: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  parsePrice: (value: string) => number;
  act: (body: Record<string, unknown>, success: string) => Promise<boolean>;
  busy: boolean;
  t: CopySet;
  language: Language;
  profileImageVersion: number;
  wallet: DeliveryWallet;
  memberWallets: MemberWallet[];
  monthlyBudgetCents: number;
  currentMonthlyTotal: number;
  pushPublicKey: string | null;
}) {
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const [pushState, setPushState] = useState<
    "checking" | "disabled" | "enabled" | "blocked" | "unavailable" | "working"
  >("checking");
  const selectedCart = queue.find((cart) => cart.id === selectedCartId) ?? queue[0];
  const otherCarts = selectedCart
    ? queue.filter((cart) => cart.id !== selectedCart.id)
    : [];
  const activeItems = selectedCart ? itemsFor(selectedCart.id) : [];
  const completeReady = selectedCart
    ? activeItems.length > 0
      ? activeItems.every((item) => item.purchase_status !== "requested")
      : Boolean(selectedCart.missing_products_note.trim())
    : false;
  const budgetRatio = monthlyBudgetCents > 0 ? currentMonthlyTotal / monthlyBudgetCents : 0;
  const budgetRemaining = Math.max(monthlyBudgetCents - currentMonthlyTotal, 0);
  const activeBoughtTotal = activeItems
    .filter((item) => item.purchase_status === "bought")
    .reduce(
      (sum, item) =>
        sum + cartItemTotalCents(item),
      0,
    );

  useEffect(() => {
    let cancelled = false;
    const checkSubscription = async () => {
      if (
        !pushPublicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setPushState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setPushState("blocked");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/family-sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setPushState(subscription ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setPushState("unavailable");
      }
    };
    void checkSubscription();
    return () => {
      cancelled = true;
    };
  }, [pushPublicKey]);

  const togglePushNotifications = async () => {
    if (!pushPublicKey || pushState === "working") return;
    try {
      setPushState("working");
      const registration = await navigator.serviceWorker.register("/family-sw.js");
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        const saved = await act(
          {
            action: "unsubscribe_push",
            actorRole: "delivery",
            endpoint: existing.endpoint,
          },
          t.notificationsDisabled,
        );
        if (!saved) {
          setPushState("enabled");
          return;
        }
        await existing.unsubscribe();
        setPushState("disabled");
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("blocked");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(pushPublicKey),
      });
      const saved = await act(
        {
          action: "subscribe_push",
          actorRole: "delivery",
          subscription: subscription.toJSON(),
        },
        t.notificationsEnabled,
      );
      if (!saved) {
        await subscription.unsubscribe();
        setPushState("disabled");
        return;
      }
      setPushState("enabled");
    } catch (error) {
      setPushState(Notification.permission === "denied" ? "blocked" : "unavailable");
      toast.error(error instanceof Error ? error.message : t.notificationsUnavailable);
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-7 sm:px-8 lg:px-12 lg:pt-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-[#b76500] dark:text-[#ffb454]">{t.delivery}</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            {view === "queue" ? t.queue : view === "history" ? t.history : t.memberBalances}
          </h1>
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-2xl bg-muted/60 p-1">
          <Button variant="ghost" className={`rounded-xl ${view === "queue" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} onClick={() => setView("queue")}>
            <ShoppingBasket /> {t.queue}
          </Button>
          <Button variant="ghost" className={`rounded-xl ${view === "history" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} onClick={() => setView("history")}>
            <ListChecks /> {t.history}
          </Button>
          <Button variant="ghost" className={`rounded-xl ${view === "balances" ? "bg-primary/12 text-primary" : "text-muted-foreground"}`} onClick={() => setView("balances")}>
            <WalletCards /> {t.balances}
          </Button>
        </div>
      </div>

      {view !== "balances" && <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-primary/15 bg-primary/[0.055] p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
              <WalletCards className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.wallet}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.allTime} · {wallet.completedOrders} {t.completedOrders} · {wallet.completedMissions} missions
              </p>
            </div>
            <Badge variant="outline" className="border-primary/20 bg-card/70 text-primary">
              +{money(wallet.earnedThisMonthCents)} {t.serviceEarnings.toLocaleLowerCase()}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              [t.earned, wallet.earnedCents, "text-foreground"],
              [t.paid, wallet.paidCents, "text-primary"],
              [t.unpaid, wallet.unpaidCents, "text-[#b76500] dark:text-[#ffb454]"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="min-w-0 rounded-2xl border border-border/80 bg-card/75 p-3 sm:p-4">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 truncate text-base font-bold tabular-nums sm:text-xl ${color}`}>
                  {money(Number(value))}
                </p>
              </div>
            ))}
          </div>
          {wallet.completedMissions > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs">
              <span className="text-muted-foreground">Missions maison terminées</span>
              <strong className="text-primary">{wallet.completedMissions} · +{money(wallet.missionEarnedCents)}</strong>
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PiggyBank className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.budget}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.monthlyBudget}</p>
            </div>
          </div>
          {monthlyBudgetCents > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <strong>{money(currentMonthlyTotal)}</strong>
                <span className="text-muted-foreground">/ {money(monthlyBudgetCents)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${budgetRatio >= 1 ? "bg-destructive" : budgetRatio >= 0.8 ? "bg-[#d98200]" : "bg-primary"}`}
                  style={{ width: `${Math.min(budgetRatio * 100, 100)}%` }}
                />
              </div>
              <p className={`mt-3 text-xs font-medium ${budgetRatio >= 0.8 ? "text-[#b76500] dark:text-[#ffb454]" : "text-muted-foreground"}`}>
                {budgetRatio >= 1
                  ? t.budgetExceeded
                  : budgetRatio >= 0.8
                    ? t.budgetWarning
                    : `${t.budgetRemaining}: ${money(budgetRemaining)}`}
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t.budgetNotSet}</p>
          )}
        </article>

        <article className="rounded-3xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BellRing className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.notificationsNewOrders}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {pushState === "enabled"
                  ? t.notificationsEnabled
                  : pushState === "blocked"
                    ? t.notificationsBlocked
                    : pushState === "unavailable"
                      ? t.notificationsUnavailable
                      : t.notificationsHelp}
              </p>
            </div>
          </div>
          <Button
            variant={pushState === "enabled" ? "outline" : "default"}
            className="mt-4 w-full rounded-xl"
            disabled={pushState === "checking" || pushState === "working" || pushState === "blocked" || pushState === "unavailable"}
            onClick={() => void togglePushNotifications()}
          >
            {pushState === "working" ? <Loader2 className="animate-spin" /> : <BellRing />}
            {pushState === "enabled" ? t.disableNotifications : t.enableNotifications}
          </Button>
        </article>
      </div>}

      {view === "balances" ? (
        <MemberBalancesManager
          wallets={memberWallets}
          money={money}
          act={act}
          busy={busy}
          t={t}
          language={language}
          actorRole="delivery"
        />
      ) : view === "queue" ? (
        selectedCart ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ProfileAvatar
                    user={{ id: selectedCart.member_id, name: selectedCart.member_name, initials: selectedCart.member_initials }}
                    version={profileImageVersion}
                    className="size-12 rounded-2xl text-sm"
                  />
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

              <MissingProductsNote
                note={selectedCart.missing_products_note}
                label={t.missingProducts}
                className="mb-5"
              />

              <div className="space-y-3">
                {activeItems.map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-3 sm:grid-cols-[64px_1fr_125px_auto] sm:items-center">
                    <ProductImage position={item.image_position} imageUrl={item.image_url} name={productName(item)} className="size-16 rounded-xl" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{productName(item)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {itemRequestLabel(item)}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor={`delivery-price-${item.id}`} className="mb-1.5 text-xs text-muted-foreground">
                        {isAmountItem(item) ? t.amountToSpend : t.price}
                      </Label>
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
                        className="h-11 w-full rounded-xl border-border sm:size-11"
                        disabled={busy}
                        onClick={() => void act({ action: "update_item", actorRole: "delivery", itemId: item.id, purchaseStatus: "bought", actualUnitPriceCents: parsePrice(prices[item.id] ?? "") }, "Article marqué acheté.")}
                        aria-label={t.bought}
                      >
                        <Check />
                      </Button>
                      <Button
                        size="icon"
                        variant={item.purchase_status === "unbought" ? "destructive" : "outline"}
                        className="h-11 w-full rounded-xl border-border sm:size-11"
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.serviceFee}: {money(selectedCart.service_fee_cents)}
                  </p>
                  <p className="mt-1 font-semibold">
                    {t.totalWithService}: {money(activeBoughtTotal + selectedCart.service_fee_cents)}
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{cart.member_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {itemsFor(cart.id).length} {t.items}
                        {cart.missing_products_note.trim() ? ` · ${t.missingProducts}` : ""}
                      </p>
                    </div>
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
            const purchasedTotal = boughtItems.reduce((sum, item) => sum + cartItemTotalCents(item), 0);
            const total = purchasedTotal + cart.service_fee_cents;
            return (
              <article key={cart.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Check /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">{cart.member_name} · #{cart.id}</p><p className="mt-1 text-xs text-muted-foreground">{cart.completed_at ? new Date(cart.completed_at).toLocaleDateString("fr-MA", { dateStyle: "medium" }) : ""}</p><p className="mt-1 text-xs text-primary">{t.serviceFee}: {money(cart.service_fee_cents)}</p></div>
                  <Badge variant="outline" className="border-border">{boughtItems.length}/{itemsFor(cart.id).length} {t.bought.toLocaleLowerCase()}</Badge>
                  <strong>{money(total)}</strong>
                </div>
                <MissingProductsNote
                  note={cart.missing_products_note}
                  label={t.missingProducts}
                  className="mt-3"
                />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
