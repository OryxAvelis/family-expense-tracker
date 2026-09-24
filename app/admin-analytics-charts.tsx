"use client";

import { useMemo } from "react";
import { purchasedLineTotal } from "@/lib/spending";
import { BarChart3, PieChart as PieChartIcon, ShoppingBasket } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AnalyticsLanguage = "fr" | "ar" | "en";

type AnalyticsUser = {
  id: number;
  name: string;
  role: string;
  initials: string;
};

type AnalyticsProduct = {
  id: number;
  category: string;
};

type AnalyticsCart = {
  id: number;
  member_id: number;
  member_name: string;
  member_initials: string;
  status: string;
  completed_at: string | null;
  service_fee_cents: number;
};

type AnalyticsItem = {
  id: number;
  cart_id: number;
  product_id: number;
  quantity_hundredths: number;
  requested_unit_price_cents: number;
  actual_unit_price_cents: number;
  purchase_status: string;
};

type AdminAnalyticsChartsProps = {
  language: AnalyticsLanguage;
  currentMonth: string;
  users: readonly AnalyticsUser[];
  products: readonly AnalyticsProduct[];
  carts: readonly AnalyticsCart[];
  items: readonly AnalyticsItem[];
  serviceFeeCents: number;
  formatMoney: (cents: number) => string;
};

const copy = {
  fr: {
    categoryTitle: "Dépenses par catégorie",
    categoryDescription: "Achats et service de livraison de ce mois",
    memberTitle: "Dépenses par membre",
    memberDescription: "Achats et service pour chaque membre ce mois-ci",
    emptyTitle: "Pas encore d’achats ce mois-ci",
    emptyDescription: "Les graphiques apparaîtront dès qu’un panier sera terminé.",
    spent: "Dépensé",
    total: "Total",
    other: "Autres",
    items: "articles",
    orders: "commandes",
    categories: {
      food: "Alimentation",
      cleaning: "Nettoyage",
      hygiene: "Hygiène",
      school: "École",
      household: "Maison",
      health: "Santé",
      service: "Service de livraison",
    },
  },
  ar: {
    categoryTitle: "المصاريف حسب الفئة",
    categoryDescription: "مشتريات وخدمة توصيل هذا الشهر",
    memberTitle: "المصاريف حسب فرد العائلة",
    memberDescription: "مشتريات وخدمة كل فرد خلال هذا الشهر",
    emptyTitle: "لا توجد مشتريات هذا الشهر بعد",
    emptyDescription: "ستظهر الرسوم بعد إنهاء أول سلة.",
    spent: "المبلغ",
    total: "المجموع",
    other: "أخرى",
    items: "منتجات",
    orders: "طلبات",
    categories: {
      food: "مواد غذائية",
      cleaning: "التنظيف",
      hygiene: "النظافة",
      school: "المدرسة",
      household: "المنزل",
      health: "الصحة",
      service: "خدمة التوصيل",
    },
  },
  en: {
    categoryTitle: "Spending by category",
    categoryDescription: "This month’s purchases and delivery service",
    memberTitle: "Spending by family member",
    memberDescription: "Purchases and service for every family member this month",
    emptyTitle: "No purchases yet this month",
    emptyDescription: "Charts will appear after the first cart is completed.",
    spent: "Spent",
    total: "Total",
    other: "Other",
    items: "items",
    orders: "orders",
    categories: {
      food: "Food",
      cleaning: "Cleaning",
      hygiene: "Hygiene",
      school: "School",
      household: "Household",
      health: "Health",
      service: "Delivery service",
    },
  },
} as const;

const categoryColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#2aa198",
  "#77858f",
  "#f59e0b",
];

function shortenedName(name: string) {
  const cleanName = name.trim();
  return cleanName.length > 10 ? `${cleanName.slice(0, 9)}…` : cleanName;
}

function ChartEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <ShoppingBasket className="size-6" />
      </span>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function AdminAnalyticsCharts({
  language,
  currentMonth,
  users,
  products,
  carts,
  items,
  serviceFeeCents,
  formatMoney,
}: AdminAnalyticsChartsProps) {
  const t = copy[language];
  const locale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";

  const { categoryData, memberData, totalSpent } = useMemo(() => {
    const productsById = new Map(products.map((product) => [product.id, product]));
    const completedCarts = carts.filter(
      (cart) =>
        cart.status === "completed" &&
        Boolean(cart.completed_at) &&
        cart.completed_at?.slice(0, 7) === currentMonth,
    );
    const cartsById = new Map(completedCarts.map((cart) => [cart.id, cart]));
    const categoryTotals = new Map<string, { value: number; count: number }>();
    const memberTotals = new Map<
      number,
      { id: number; name: string; initials: string; value: number }
    >();

    for (const user of users) {
      if (user.role === "member") {
        memberTotals.set(user.id, {
          id: user.id,
          name: user.name,
          initials: user.initials,
          value: 0,
        });
      }
    }

    for (const cart of completedCarts) {
      if (!memberTotals.has(cart.member_id)) {
        memberTotals.set(cart.member_id, {
          id: cart.member_id,
          name: cart.member_name,
          initials: cart.member_initials,
          value: 0,
        });
      }
      const memberEntry = memberTotals.get(cart.member_id);
      if (memberEntry) memberEntry.value += cart.service_fee_cents ?? serviceFeeCents;
    }

    const totalServiceFees = completedCarts.reduce(
      (sum, cart) => sum + (cart.service_fee_cents ?? serviceFeeCents),
      0,
    );
    if (totalServiceFees > 0) {
      categoryTotals.set("service", {
        value: totalServiceFees,
        count: completedCarts.filter((cart) => (cart.service_fee_cents ?? serviceFeeCents) > 0).length,
      });
    }

    for (const item of items) {
      if (item.purchase_status !== "bought") continue;
      const cart = cartsById.get(item.cart_id);
      if (!cart) continue;

      const amount = purchasedLineTotal(item);
      if (!amount) continue;

      const category = productsById.get(item.product_id)?.category || "other";
      const categoryEntry = categoryTotals.get(category) ?? { value: 0, count: 0 };
      categoryEntry.value += amount;
      categoryEntry.count += 1;
      categoryTotals.set(category, categoryEntry);

      const memberEntry = memberTotals.get(cart.member_id);
      if (memberEntry) memberEntry.value += amount;
    }

    const total = [...categoryTotals.values()].reduce((sum, entry) => sum + entry.value, 0);
    const categories = [...categoryTotals.entries()]
      .map(([key, value], index) => ({
        key,
        name:
          key in t.categories
            ? t.categories[key as keyof typeof t.categories]
            : key === "other"
              ? t.other
              : key.replaceAll(/[-_]/g, " "),
        value: value.value,
        count: value.count,
        percentage: total ? value.value / total : 0,
        color: categoryColors[index % categoryColors.length],
      }))
      .sort((left, right) => right.value - left.value)
      .map((entry, index) => ({
        ...entry,
        color: categoryColors[index % categoryColors.length],
      }));

    const members = [...memberTotals.values()]
      .map((member) => ({ ...member, shortName: shortenedName(member.name) }))
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name, locale));

    return { categoryData: categories, memberData: members, totalSpent: total };
  }, [carts, currentMonth, items, locale, products, serviceFeeCents, t, users]);

  const hasPurchases = totalSpent > 0;
  const percentageFormatter = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const compactMoney = (cents: number) =>
    `${new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100)} DH`;
  const tooltipStyle = {
    border: "1px solid var(--border)",
    borderRadius: "1rem",
    background: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 16px 45px rgba(0, 0, 0, 0.12)",
  };

  return (
    <div
      className="mt-5 grid gap-5 xl:grid-cols-2"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <article className="animate-in fade-in slide-in-from-bottom-2 rounded-[2rem] border border-border bg-card p-4 duration-700 sm:p-6">
        <header className="mb-5 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <PieChartIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground sm:text-lg">{t.categoryTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.categoryDescription}</p>
          </div>
        </header>

        {hasPurchases ? (
          <>
            <div
              className="relative h-72 min-w-0"
              role="img"
              aria-label={`${t.categoryTitle}: ${formatMoney(totalSpent)}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={3}
                    cornerRadius={7}
                    strokeWidth={0}
                    isAnimationActive
                    animationBegin={100}
                    animationDuration={950}
                    animationEasing="ease-out"
                  >
                    {categoryData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatMoney(Number(value ?? 0)), t.spent]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">{t.total}</span>
                <strong className="mt-1 max-w-[75%] truncate text-base tracking-tight text-foreground sm:text-xl">
                  {formatMoney(totalSpent)}
                </strong>
              </div>
            </div>

            <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={t.categoryTitle}>
              {categoryData.map((entry) => (
                <li
                  key={entry.key}
                  className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/35 px-3 py-2.5"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium">{entry.name}<strong className="mt-0.5 block tabular-nums">{formatMoney(entry.value)}</strong></span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {percentageFormatter.format(entry.percentage)}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="sr-only">
              {categoryData.map((entry) => (
                <li key={entry.key}>
                  {entry.name}: {formatMoney(entry.value)}, {entry.count}{" "}
                  {entry.key === "service" ? t.orders : t.items}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ChartEmptyState title={t.emptyTitle} description={t.emptyDescription} />
        )}
      </article>

      <article className="animate-in fade-in slide-in-from-bottom-2 rounded-[2rem] border border-border bg-card p-4 delay-150 duration-700 sm:p-6">
        <header className="mb-5 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground sm:text-lg">{t.memberTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.memberDescription}</p>
          </div>
        </header>

        {hasPurchases ? (
          <>
            <div
              className="min-w-0"
              style={{ height: Math.max(280, Math.min(440, memberData.length * 54 + 70)) }}
              role="img"
              aria-label={t.memberTitle}
              dir="ltr"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={memberData}
                  layout="vertical"
                  margin={{ top: 8, right: 6, bottom: 8, left: 0 }}
                  barCategoryGap="24%"
                >
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 5" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickCount={3}
                    tickFormatter={(value) => compactMoney(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.38 }}
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                    formatter={(value) => [formatMoney(Number(value ?? 0)), t.spent]}
                  />
                  <Bar
                    dataKey="value"
                    name={t.spent}
                    fill="var(--chart-1)"
                    radius={[0, 10, 10, 0]}
                    isAnimationActive
                    animationBegin={180}
                    animationDuration={1050}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid gap-2" aria-label={t.memberTitle}>
              {memberData.map((member) => (
                <li key={member.id} className="flex justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2.5 text-sm">
                  <span className="min-w-0 break-words">{member.name}</span><strong className="shrink-0 tabular-nums">{formatMoney(member.value)}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ChartEmptyState title={t.emptyTitle} description={t.emptyDescription} />
        )}
      </article>
    </div>
  );
}
