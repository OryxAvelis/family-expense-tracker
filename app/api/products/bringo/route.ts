import { extractPackageSize, inferCatalogCategory } from "@/lib/catalogue";
import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONSTRUCTOR_BASE_URL = "https://ac.cnstrc.com";
// Constructor index keys identify a public catalogue; they are not secret API tokens.
const BRINGO_INDEX_KEY = "key_RXaj9cqebJi8jKk8";
const SEARCH_CACHE_DURATION_MS = 5 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 80;

const SEARCH_ALIAS_GROUPS = [
  ["lait", "milk", "حليب"],
  ["pain", "bread", "خبز"],
  ["baguette", "خبزة"],
  ["farine", "flour", "دقيق"],
  ["semoule", "semolina", "سميد"],
  ["sucre", "sugar", "سكر"],
  ["huile", "oil", "زيت"],
  ["oeuf", "oeufs", "egg", "eggs", "بيض"],
  ["savon", "soap", "صابون"],
  ["lessive", "detergent", "غسيل"],
  ["cafe", "coffee", "قهوة"],
  ["the", "tea", "شاي"],
  ["eau", "water", "ماء"],
  ["fromage", "cheese", "جبن"],
  ["yaourt", "yogurt", "ياغورت"],
  ["riz", "rice", "ارز", "أرز"],
  ["pates", "pasta", "معكرونة"],
  ["nettoyage", "cleaning", "تنظيف"],
  ["hygiene", "beauty", "نظافة", "عناية"],
] as const;

type ProductCategory = "food" | "cleaning" | "hygiene" | "school" | "household" | "health";

type ConstructorProduct = {
  value?: unknown;
  data?: {
    id?: unknown;
    price?: unknown;
    image_url?: unknown;
    x_brand?: unknown;
    x_enabled?: unknown;
  };
};

type ConstructorResponse = {
  response?: {
    results?: ConstructorProduct[];
  };
};

type BringoCatalogProduct = {
  external_id: string;
  name: string;
  search_text: string;
  category: ProductCategory;
  image_url: string | null;
  price_cents: number;
  crossed_price_cents: null;
  package_size: string | null;
  store: "Carrefour · Bringo";
};

const localProductColumns = `id, name_fr, name_ar, name_en, category, unit,
  unit_price_cents, image_position, image_url, barcode, package_size,
  external_source, external_id, purchase_count`;

const searchCache = new Map<
  string,
  { expiresAt: number; products: BringoCatalogProduct[] }
>();

function cleanText(value: unknown, maximum = 180) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function identifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  const text = cleanText(value, 40);
  return /^\d{1,30}$/.test(text) ? text : "";
}

function normalized(value: unknown) {
  return cleanText(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLocaleLowerCase();
}

function queryVariants(query: string) {
  const cleanQuery = cleanText(query, 120);
  const words = new Set(normalized(cleanQuery).split(/\s+/).filter(Boolean));
  const variants = new Set([cleanQuery]);

  for (const group of SEARCH_ALIAS_GROUPS) {
    if (group.some((term) => words.has(normalized(term)))) {
      // The Bringo index is French. Add the canonical French term only when
      // the member searched in English or Arabic, avoiding duplicate store hits.
      variants.add(group[0]);
    }
  }
  return [...variants];
}

function safeImageUrl(value: unknown) {
  const raw = cleanText(value, 800);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" &&
      parsed.hostname === "storage.googleapis.com" &&
      (parsed.pathname.startsWith("/sales-img-ma-live/") ||
        parsed.pathname.startsWith("/bringoimg/"))
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function packageSize(value: unknown) {
  return extractPackageSize(cleanText(value));
}

function appCategory(name: string, brand: string): ProductCategory {
  return inferCatalogCategory(name, brand);
}

function toCatalogProduct(source: ConstructorProduct): BringoCatalogProduct | null {
  const externalId = identifier(source.data?.id);
  const name = cleanText(source.value);
  const brand = cleanText(source.data?.x_brand, 100);
  const rawPrice = Number(source.data?.price);
  const priceCents = Math.round(rawPrice);

  if (
    !externalId ||
    !name ||
    source.data?.x_enabled === false ||
    !Number.isFinite(rawPrice) ||
    priceCents <= 0 ||
    priceCents > 100_000_000
  ) {
    return null;
  }

  return {
    external_id: externalId,
    name,
    search_text: `${name} ${brand}`.trim(),
    category: appCategory(name, brand),
    image_url: safeImageUrl(source.data?.image_url),
    price_cents: priceCents,
    crossed_price_cents: null,
    package_size: packageSize(name),
    store: "Carrefour · Bringo",
  };
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: "https://www.bringo.ma/fr_MA/",
        "User-Agent":
          "FamilyExpenseTracker/0.2 (https://github.com/OryxAvelis/family-expense-tracker)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Le catalogue Carrefour est momentanément indisponible.");
    return (await response.json()) as ConstructorResponse;
  } catch {
    throw new Error("Le catalogue Carrefour est momentanément indisponible.");
  } finally {
    clearTimeout(timeout);
  }
}

function searchUrl(query: string) {
  const parameters = new URLSearchParams({
    key: BRINGO_INDEX_KEY,
    section: "Products",
    num_results_per_page: "20",
  });
  return `${CONSTRUCTOR_BASE_URL}/v1/search/${encodeURIComponent(query)}?${parameters.toString()}`;
}

function productUrl(externalId: string) {
  const parameters = new URLSearchParams({
    key: BRINGO_INDEX_KEY,
    section: "Products",
    ids: externalId,
    num_results_per_page: "1",
  });
  return `${CONSTRUCTOR_BASE_URL}/browse/items?${parameters.toString()}`;
}

async function searchBringo(query: string) {
  const cacheKey = normalized(query);
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.products;

  const responses = await Promise.allSettled(
    queryVariants(query).map((variant) => fetchJson(searchUrl(variant))),
  );
  const products = new Map<string, BringoCatalogProduct>();
  const productNames = new Set<string>();

  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    const results = response.value.response?.results;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      const product = toCatalogProduct(result);
      if (!product) continue;
      const nameKey = normalized(product.name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (productNames.has(nameKey)) continue;
      const existing = products.get(product.external_id);
      if (existing) {
        existing.search_text = `${existing.search_text} ${product.search_text}`;
      } else {
        products.set(product.external_id, product);
        productNames.add(nameKey);
      }
    }
  }

  if (responses.every((response) => response.status === "rejected")) {
    throw new Error("La recherche Carrefour est momentanément indisponible.");
  }

  const found = [...products.values()];
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_DURATION_MS, products: found });
  return found;
}

async function fetchProduct(externalId: string) {
  const payload = await fetchJson(productUrl(externalId));
  const result = payload.response?.results?.[0];
  const product = result ? toCatalogProduct(result) : null;
  return product?.external_id === externalId ? product : null;
}

async function requireMember(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return { response: Response.json({ error: "Connexion requise." }, { status: 401 }) };
  if (viewer.role !== "member" && viewer.role !== "admin") {
    return {
      response: Response.json(
        { error: "Le catalogue Carrefour est réservé à la famille." },
        { status: 403 },
      ),
    };
  }
  return { viewer };
}

export async function GET(request: Request) {
  const access = await requireMember(request);
  if ("response" in access) return access.response;

  try {
    const query = cleanText(new URL(request.url).searchParams.get("q"), 120);
    const products = query.length >= 2 ? await searchBringo(query) : [];
    return Response.json(
      { products },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue Carrefour indisponible.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const access = await requireMember(request);
  if ("response" in access) return access.response;

  try {
    const body = (await request.json()) as { externalId?: unknown };
    const externalId = identifier(body.externalId);
    if (!externalId) {
      return Response.json({ error: "Le produit Carrefour est invalide." }, { status: 400 });
    }

    // Re-fetch by ID so names, prices and images are never trusted from the browser.
    const source = await fetchProduct(externalId);
    if (!source) {
      return Response.json(
        { error: "Ce produit n’est plus disponible dans le catalogue Carrefour." },
        { status: 404 },
      );
    }

    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("products")
      .select("id, purchase_count")
      .eq("external_source", "bringo")
      .eq("external_id", source.external_id)
      .maybeSingle();
    throwIfSupabaseError(existingError);

    const { error: upsertError } = await db.from("products").upsert(
      {
        name_fr: source.name,
        name_ar: source.name,
        name_en: source.name,
        category: source.category,
        unit: "pièce",
        unit_price_cents: source.price_cents,
        image_position: "0% 0%",
        image_url: source.image_url,
        package_size: source.package_size,
        external_source: "bringo",
        external_id: source.external_id,
        purchase_count: existing?.purchase_count ?? 0,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_source,external_id" },
    );
    throwIfSupabaseError(upsertError);

    const { data: product, error: productError } = await db
      .from("products")
      .select(localProductColumns)
      .eq("external_source", "bringo")
      .eq("external_id", source.external_id)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(productError);
    if (!product) throw new Error("Le produit Carrefour n’a pas pu être enregistré.");

    return Response.json({ product, imported: !existing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import Carrefour impossible.";
    return Response.json({ error: message }, { status: 502 });
  }
}
