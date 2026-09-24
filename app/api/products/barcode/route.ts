import { inferCatalogCategory } from "@/lib/catalogue";
import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MYMARKET_BASE_URL = "https://www.mymarket.ma";
const MYMARKET_CACHE_DURATION_MS = 30 * 60 * 1000;
const MAX_MYMARKET_CACHE_ENTRIES = 500;
const SHOPIFY_PAGE_SIZE = 250;
const MAX_ANIMAL_PAGES = 4;

type ProductCategory =
  | "food"
  | "cleaning"
  | "hygiene"
  | "school"
  | "household"
  | "health";

type MyMarketVariant = {
  id?: unknown;
  title?: unknown;
  sku?: unknown;
  price?: unknown;
  featured_image?: { src?: unknown } | string | null;
};

type MyMarketProduct = {
  id?: unknown;
  title?: unknown;
  handle?: unknown;
  type?: unknown;
  product_type?: unknown;
  tags?: unknown;
  featured_image?: unknown;
  images?: unknown;
  variants?: unknown;
};

type MyMarketSearchProduct = {
  handle?: unknown;
  id?: unknown;
  title?: unknown;
  type?: unknown;
};

type MyMarketSearchResponse = {
  resources?: {
    results?: {
      products?: MyMarketSearchProduct[];
    };
  };
};

type MyMarketCollectionResponse = {
  products?: MyMarketProduct[];
};

type MyMarketMatch = {
  externalId: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  category: ProductCategory;
  priceCents: number;
  imageUrl: string | null;
  packageSize: string | null;
};

type MyMarketLookupResult =
  | { kind: "found"; match: MyMarketMatch }
  | { kind: "excluded" }
  | { kind: "not_found" };

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  product_name_ar?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
};

type OpenFoodFactsResponse = {
  status?: string;
  result?: { id?: string };
  product?: OpenFoodFactsProduct;
};

const productColumns = `id, name_fr, name_ar, name_en, category, unit,
  unit_price_cents, image_position, image_url, barcode, package_size, purchase_count`;

const myMarketLookupCache = new Map<
  string,
  { expiresAt: number; result: MyMarketLookupResult }
>();
const myMarketLookupRequests = new Map<string, Promise<MyMarketLookupResult>>();
let animalIdsCache: { expiresAt: number; ids: Set<string> } | null = null;
let animalIdsRequest: Promise<Set<string>> | null = null;

function cleanText(value: unknown, maximum = 120) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function identifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return cleanText(value, 100);
}

function normalized(value: unknown) {
  return cleanText(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function tagsText(value: unknown) {
  if (Array.isArray(value)) return value.map((tag) => cleanText(tag)).join(" ");
  return cleanText(value, 500);
}

function safeImageUrl(value: unknown, source: "mymarket" | "openfoodfacts") {
  let raw = cleanText(value, 800);
  if (!raw) return null;
  if (source === "mymarket" && raw.startsWith("//")) raw = `https:${raw}`;

  try {
    const parsed = new URL(raw);
    const isOpenFoodFacts =
      parsed.hostname === "openfoodfacts.org" ||
      parsed.hostname.endsWith(".openfoodfacts.org");
    const isMyMarket =
      parsed.hostname === "cdn.shopify.com" ||
      ((parsed.hostname === "www.mymarket.ma" || parsed.hostname === "mymarket.ma") &&
        parsed.pathname.startsWith("/cdn/shop/"));
    const approvedHost = source === "mymarket" ? isMyMarket : isOpenFoodFacts;
    return parsed.protocol === "https:" && approvedHost ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeBarcode(value: unknown) {
  const barcode = typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
  return /^\d{8,14}$/.test(barcode) ? barcode : "";
}

function myMarketProductUrl(handle: string, language: "fr" | "ar" | "en") {
  const locale = language === "fr" ? "" : `/${language}`;
  return `${MYMARKET_BASE_URL}${locale}/products/${encodeURIComponent(handle)}.js`;
}

function myMarketSearchUrl(barcode: string) {
  const endpoint = new URL(`${MYMARKET_BASE_URL}/search/suggest.json`);
  endpoint.searchParams.set("q", barcode);
  endpoint.searchParams.set("resources[type]", "product");
  endpoint.searchParams.set("resources[limit]", "10");
  endpoint.searchParams.set("resources[options][unavailable_products]", "show");
  return endpoint.toString();
}

function myMarketAnimalCollectionUrl(page: number) {
  return `${MYMARKET_BASE_URL}/collections/animaux/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`;
}

async function fetchMyMarketJson<T>(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "FamilyExpenseTracker/0.2 (https://github.com/OryxAvelis/family-expense-tracker)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    throw new Error("MyMarket est momentanément indisponible.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error("MyMarket est momentanément indisponible.");
  return (await response.json()) as T;
}

async function fetchAnimalIds() {
  if (animalIdsCache && animalIdsCache.expiresAt > Date.now()) return animalIdsCache.ids;
  if (animalIdsRequest) return animalIdsRequest;

  animalIdsRequest = (async () => {
    const ids = new Set<string>();
    for (let page = 1; page <= MAX_ANIMAL_PAGES; page += 1) {
      const payload = await fetchMyMarketJson<MyMarketCollectionResponse>(
        myMarketAnimalCollectionUrl(page),
      );
      if (!Array.isArray(payload.products)) {
        throw new Error("Le format du catalogue MyMarket a changé.");
      }
      for (const product of payload.products) {
        const id = identifier(product.id);
        if (id) ids.add(id);
      }
      if (payload.products.length < SHOPIFY_PAGE_SIZE) break;
    }
    animalIdsCache = {
      expiresAt: Date.now() + MYMARKET_CACHE_DURATION_MS,
      ids,
    };
    return ids;
  })();

  try {
    return await animalIdsRequest;
  } finally {
    animalIdsRequest = null;
  }
}

function categoryForMyMarket(product: MyMarketProduct): ProductCategory {
  return inferCatalogCategory(cleanText(product.title), [product.type, product.product_type, tagsText(product.tags)].map((value) => cleanText(value, 500)).join(" "));
}

function packageSize(product: MyMarketProduct, variant: MyMarketVariant) {
  const variantTitle = cleanText(variant.title);
  const usefulVariantTitle = normalized(variantTitle) === "DEFAULT TITLE" ? "" : variantTitle;
  const text = `${usefulVariantTitle} ${cleanText(product.title, 240)}`.trim();
  const explicitSize = text.match(
    /(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:ml|cl|l|kg|g|mg|pi[eè]ces?|pcs?|unit[eé]s?|sachets?|capsules?|rouleaux?)\b/i,
  );
  if (explicitSize) return explicitSize[0].replace(/\s+/g, " ");

  const leadingCount = text.match(/^\s*(\d{1,3})\s+(?:masques?|couches?|lingettes?|sacs?)\b/i);
  return leadingCount ? `${leadingCount[1]} pièces` : null;
}

function myMarketImage(product: MyMarketProduct, variant: MyMarketVariant) {
  const variantImage = variant.featured_image;
  const variantImageValue =
    variantImage && typeof variantImage === "object" ? variantImage.src : variantImage;
  const firstImage = Array.isArray(product.images) ? product.images[0] : null;
  return safeImageUrl(variantImageValue ?? product.featured_image ?? firstImage, "mymarket");
}

function myMarketPriceCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const dirhams = Number(value);
    if (Number.isFinite(dirhams) && dirhams >= 0) return Math.round(dirhams * 100);
  }
  return null;
}

async function localizedMyMarketName(
  handle: string,
  language: "ar" | "en",
  fallback: string,
) {
  try {
    const product = await fetchMyMarketJson<MyMarketProduct>(
      myMarketProductUrl(handle, language),
    );
    return cleanText(product.title) || fallback;
  } catch {
    return fallback;
  }
}

async function findMyMarketProduct(barcode: string): Promise<MyMarketLookupResult> {
  const cached = myMarketLookupCache.get(barcode);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const pending = myMarketLookupRequests.get(barcode);
  if (pending) return pending;

  const request = (async (): Promise<MyMarketLookupResult> => {
    const search = await fetchMyMarketJson<MyMarketSearchResponse>(
      myMarketSearchUrl(barcode),
    );
    const candidates = search.resources?.results?.products;
    if (!Array.isArray(candidates)) {
      throw new Error("Le format de recherche MyMarket a changé.");
    }

    const detailedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const handle = cleanText(candidate.handle, 180);
        if (!handle) return null;
        try {
          const product = await fetchMyMarketJson<MyMarketProduct>(
            myMarketProductUrl(handle, "fr"),
          );
          return { candidate, handle, product };
        } catch {
          return null;
        }
      }),
    );

    for (const detailed of detailedCandidates) {
      if (!detailed) continue;
      const variants = Array.isArray(detailed.product.variants)
        ? (detailed.product.variants as MyMarketVariant[])
        : [];
      const variant = variants.find((entry) => cleanText(entry.sku, 40) === barcode);
      if (!variant) continue;

      const externalId = identifier(detailed.product.id) || identifier(detailed.candidate.id);
      const animalType = normalized(
        detailed.product.type ?? detailed.product.product_type ?? detailed.candidate.type,
      );
      const animalIds = await fetchAnimalIds();
      if (animalType === "ANIMAUX" || animalIds.has(externalId)) {
        return { kind: "excluded" };
      }

      const nameFr = cleanText(detailed.product.title) || cleanText(detailed.candidate.title);
      const priceCents = myMarketPriceCents(variant.price);
      if (!externalId || !nameFr || priceCents === null) continue;

      const [nameAr, nameEn] = await Promise.all([
        localizedMyMarketName(detailed.handle, "ar", nameFr),
        localizedMyMarketName(detailed.handle, "en", nameFr),
      ]);
      return {
        kind: "found",
        match: {
          externalId,
          nameFr,
          nameAr,
          nameEn,
          category: categoryForMyMarket(detailed.product),
          priceCents,
          imageUrl: myMarketImage(detailed.product, variant),
          packageSize: packageSize(detailed.product, variant),
        },
      };
    }

    return { kind: "not_found" };
  })();
  myMarketLookupRequests.set(barcode, request);

  try {
    const result = await request;
    if (myMarketLookupCache.size >= MAX_MYMARKET_CACHE_ENTRIES) {
      const oldestKey = myMarketLookupCache.keys().next().value;
      if (oldestKey) myMarketLookupCache.delete(oldestKey);
    }
    myMarketLookupCache.set(barcode, {
      expiresAt: Date.now() + MYMARKET_CACHE_DURATION_MS,
      result,
    });
    return result;
  } finally {
    myMarketLookupRequests.delete(barcode);
  }
}

async function saveMyMarketProduct(
  db: ReturnType<typeof getSupabaseAdmin>,
  barcode: string,
  match: MyMarketMatch,
) {
  const { data: existing, error: existingError } = await db
    .from("products")
    .select("id, purchase_count")
    .eq("external_source", "mymarket")
    .eq("external_id", match.externalId)
    .maybeSingle();
  throwIfSupabaseError(existingError);

  const { error: upsertError } = await db.from("products").upsert(
    {
      name_fr: match.nameFr,
      name_ar: match.nameAr,
      name_en: match.nameEn,
      category: match.category,
      unit: "pièce",
      unit_price_cents: match.priceCents,
      image_position: "0% 0%",
      image_url: match.imageUrl,
      barcode,
      package_size: match.packageSize,
      external_source: "mymarket",
      external_id: match.externalId,
      purchase_count: existing?.purchase_count ?? 0,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "external_source,external_id" },
  );
  throwIfSupabaseError(upsertError);

  const { data: product, error: productError } = await db
    .from("products")
    .select(productColumns)
    .eq("external_source", "mymarket")
    .eq("external_id", match.externalId)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(productError);
  if (!product) throw new Error("Le produit MyMarket n’a pas pu être enregistré.");

  return { product, imported: !existing };
}

async function findOpenFoodFactsProduct(barcode: string) {
  const endpoint = new URL(`https://world.openfoodfacts.org/api/v3/product/${barcode}`);
  endpoint.searchParams.set("cc", "ma");
  endpoint.searchParams.set("lc", "fr");
  endpoint.searchParams.set(
    "fields",
    "code,product_name,product_name_fr,product_name_ar,product_name_en,brands,quantity,image_front_small_url",
  );

  let remoteResponse: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    remoteResponse = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "FamilyExpenseTracker/0.2 (https://github.com/OryxAvelis/family-expense-tracker)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    return {
      response: Response.json(
        {
          error:
            "MyMarket et Open Food Facts sont momentanément indisponibles. Réessayez ou ajoutez le produit manuellement.",
        },
        { status: 502 },
      ),
    };
  } finally {
    clearTimeout(timeout);
  }

  if (remoteResponse.status === 404) {
    return {
      response: Response.json(
        {
          error:
            "Produit introuvable dans MyMarket et Open Food Facts. Ajoutez-le manuellement depuis l’admin.",
        },
        { status: 404 },
      ),
    };
  }
  if (!remoteResponse.ok) {
    return {
      response: Response.json(
        { error: "Open Food Facts ne répond pas correctement. Réessayez plus tard." },
        { status: 502 },
      ),
    };
  }

  const remote = (await remoteResponse.json()) as OpenFoodFactsResponse;
  const source = remote.product;
  if (!source || remote.result?.id !== "product_found") {
    return {
      response: Response.json(
        {
          error:
            "Produit introuvable dans MyMarket et Open Food Facts. Ajoutez-le manuellement depuis l’admin.",
        },
        { status: 404 },
      ),
    };
  }
  return { source };
}

async function saveOpenFoodFactsProduct(
  db: ReturnType<typeof getSupabaseAdmin>,
  barcode: string,
  source: OpenFoodFactsProduct,
) {
  const generalName = cleanText(source.product_name);
  const brand = cleanText(source.brands, 80);
  const fallbackName = generalName || brand;
  const nameFr = cleanText(source.product_name_fr) || fallbackName;
  if (!nameFr) {
    return Response.json(
      { error: "Ce code existe, mais le nom du produit manque. Ajoutez-le manuellement depuis l’admin." },
      { status: 422 },
    );
  }

  const nameAr = cleanText(source.product_name_ar) || nameFr;
  const nameEn = cleanText(source.product_name_en) || generalName || nameFr;
  const packageSizeValue = cleanText(source.quantity, 60) || null;
  const imageUrl = safeImageUrl(source.image_front_small_url, "openfoodfacts");

  const { error: insertError } = await db.from("products").upsert(
    {
      name_fr: nameFr,
      name_ar: nameAr,
      name_en: nameEn,
      category: "food",
      unit: "pièce",
      unit_price_cents: 0,
      image_position: "0% 0%",
      image_url: imageUrl,
      barcode,
      package_size: packageSizeValue,
      purchase_count: 0,
      active: true,
    },
    { onConflict: "barcode", ignoreDuplicates: true },
  );
  throwIfSupabaseError(insertError);

  const { data: product, error: productError } = await db
    .from("products")
    .select(productColumns)
    .eq("barcode", barcode)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(productError);
  if (!product) throw new Error("Le produit n’a pas pu être enregistré.");

  return Response.json({ product, imported: true });
}

export async function POST(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (viewer.role !== "member") {
    return Response.json({ error: "Cette fonction est réservée aux membres." }, { status: 403 });
  }

  try {
    const db = getSupabaseAdmin();
    const body = (await request.json()) as { barcode?: unknown };
    const barcode = normalizeBarcode(body.barcode);
    if (!barcode) {
      return Response.json(
        { error: "Le code-barres doit contenir entre 8 et 14 chiffres." },
        { status: 400 },
      );
    }

    const { data: existing, error: existingError } = await db
      .from("products")
      .select(productColumns)
      .eq("barcode", barcode)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(existingError);
    if (existing) return Response.json({ product: existing, imported: false });

    let myMarketResult: MyMarketLookupResult = { kind: "not_found" };
    try {
      myMarketResult = await findMyMarketProduct(barcode);
    } catch {
      // Open Food Facts remains available when MyMarket has a temporary failure.
    }

    if (myMarketResult.kind === "excluded") {
      return Response.json(
        { error: "Ce produit appartient au rayon Animaux, exclu du catalogue familial." },
        { status: 404 },
      );
    }
    if (myMarketResult.kind === "found") {
      const saved = await saveMyMarketProduct(db, barcode, myMarketResult.match);
      return Response.json(saved);
    }

    const openFoodFacts = await findOpenFoodFactsProduct(barcode);
    if ("response" in openFoodFacts) return openFoodFacts.response;
    return saveOpenFoodFactsProduct(db, barcode, openFoodFacts.source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture du code-barres impossible.";
    return Response.json({ error: message }, { status: 400 });
  }
}
