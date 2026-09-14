import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MYMARKET_BASE_URL = "https://www.mymarket.ma";
const SHOPIFY_PAGE_SIZE = 250;
const MAX_CATALOG_PAGES = 20;
const PAGE_BATCH_SIZE = 4;
const CACHE_DURATION_MS = 30 * 60 * 1000;
const SEARCH_CACHE_DURATION_MS = 5 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 60;

const SEARCH_ALIAS_GROUPS = [
  ["lait", "milk", "حليب"],
  ["pain", "bread", "خبز"],
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
  ["riz", "rice", "ارز"],
  ["pates", "pasta", "معكرونة"],
] as const;

type Language = "fr" | "ar" | "en";

type MyMarketVariant = {
  available?: unknown;
  price?: unknown;
  compare_at_price?: unknown;
  featured_image?: { src?: unknown } | null;
};

type MyMarketImage = {
  src?: unknown;
};

type MyMarketApiProduct = {
  id?: unknown;
  title?: unknown;
  handle?: unknown;
  product_type?: unknown;
  tags?: unknown;
  variants?: unknown;
  images?: unknown;
};

type MyMarketApiResponse = {
  products?: MyMarketApiProduct[];
};

type MyMarketSearchProduct = {
  available?: unknown;
  compare_at_price_max?: unknown;
  featured_image?: { url?: unknown } | null;
  handle?: unknown;
  id?: unknown;
  image?: unknown;
  price?: unknown;
  tags?: unknown;
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

type MyMarketCatalogProduct = {
  external_id: string;
  name: string;
  search_text?: string;
  category: "food" | "cleaning" | "hygiene" | "school" | "household" | "health";
  image_url: string | null;
  price_cents: number;
  crossed_price_cents: number | null;
  package_size: string | null;
  store: "MyMarket";
  handle: string;
};

const localProductColumns = `id, name_fr, name_ar, name_en, category, unit,
  unit_price_cents, image_position, image_url, barcode, package_size,
  external_source, external_id, purchase_count`;

const catalogueCache = new Map<
  Language,
  { expiresAt: number; products: MyMarketCatalogProduct[] }
>();
const catalogueRequests = new Map<Language, Promise<MyMarketCatalogProduct[]>>();
const searchCache = new Map<
  string,
  { expiresAt: number; products: MyMarketCatalogProduct[] }
>();
let animalIdsCache: { expiresAt: number; ids: Set<string> } | null = null;
let animalIdsRequest: Promise<Set<string>> | null = null;

function cleanText(value: unknown, maximum = 180) {
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

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function searchQueryVariants(query: string) {
  const cleanQuery = cleanText(query, 120);
  const queryWords = new Set(normalized(cleanQuery).split(/\s+/).filter(Boolean));
  const variants = new Set([cleanQuery]);

  for (const group of SEARCH_ALIAS_GROUPS) {
    const matchesAlias = group.some((term) => {
      const normalizedTerm = normalized(term);
      return [...queryWords].some(
        (word) =>
          word === normalizedTerm ||
          (word.length >= 4 &&
            normalizedTerm.length >= 4 &&
            Math.abs(word.length - normalizedTerm.length) <= 1 &&
            editDistance(word, normalizedTerm) <= 1),
      );
    });
    if (matchesAlias) {
      for (const term of group) {
        variants.add(term);
        if (variants.size >= 4) return [...variants];
      }
    }
  }

  const usefulWords = cleanQuery
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => normalized(word).length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const word of usefulWords) {
    variants.add(word);
    if (variants.size >= 4) break;
  }
  return [...variants];
}

function localizedPath(language: Language) {
  return language === "fr" ? "" : `/${language}`;
}

function collectionUrl(handle: string, language: Language, page: number) {
  return `${MYMARKET_BASE_URL}${localizedPath(language)}/collections/${handle}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`;
}

function productUrl(handle: string, language: Language) {
  return `${MYMARKET_BASE_URL}${localizedPath(language)}/products/${encodeURIComponent(handle)}.js`;
}

function searchUrl(query: string, language: Language) {
  return `${MYMARKET_BASE_URL}${localizedPath(language)}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
}

async function fetchJson<T>(url: string, unavailableMessage: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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
    throw new Error(unavailableMessage);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(unavailableMessage);
  return (await response.json()) as T;
}

async function fetchCollection(handle: string, language: Language) {
  const products: MyMarketApiProduct[] = [];

  for (let firstPage = 1; firstPage <= MAX_CATALOG_PAGES; firstPage += PAGE_BATCH_SIZE) {
    const pages = Array.from(
      { length: Math.min(PAGE_BATCH_SIZE, MAX_CATALOG_PAGES - firstPage + 1) },
      (_, index) => firstPage + index,
    );
    const batches = await Promise.all(
      pages.map(async (page) => {
        const payload = await fetchJson<MyMarketApiResponse>(
          collectionUrl(handle, language, page),
          "Le catalogue MyMarket est momentanément indisponible.",
        );
        if (!Array.isArray(payload.products)) {
          throw new Error("Le format du catalogue MyMarket a changé.");
        }
        return payload.products;
      }),
    );

    for (const batch of batches) {
      products.push(...batch);
      if (batch.length < SHOPIFY_PAGE_SIZE) return products;
    }
  }

  return products;
}

function tagsText(value: unknown) {
  if (Array.isArray(value)) return value.map((tag) => cleanText(tag)).join(" ");
  return cleanText(value, 500);
}

function safeImageUrl(value: unknown) {
  const raw = cleanText(value, 800);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const approvedMyMarketImage =
      parsed.hostname === "cdn.shopify.com" ||
      ((parsed.hostname === "www.mymarket.ma" || parsed.hostname === "mymarket.ma") &&
        parsed.pathname.startsWith("/cdn/shop/"));
    return parsed.protocol === "https:" && approvedMyMarketImage ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function packageSize(value: unknown) {
  const name = cleanText(value);
  const match = name.match(
    /(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:ml|cl|l|kg|g|mg|pi[eè]ces?|pcs?|unit[eé]s?|sachets?|capsules?|rouleaux?)\b/i,
  );
  return match ? match[0].replace(/\s+/g, " ") : null;
}

function appCategory(product: MyMarketApiProduct): MyMarketCatalogProduct["category"] {
  const text = normalized(
    [product.product_type, tagsText(product.tags), product.title]
      .map((value) => cleanText(value, 500))
      .join(" "),
  );

  if (/\b(CAHIER|STYLO|CRAYON|SCOLAIRE|PAPETERIE|ECOLE|CLASSEUR|CARTABLE)\b/.test(text)) {
    return "school";
  }
  if (/\b(PHARMACIE|SANTE|VITAMINE|PANSEMENT|PARAPHARMACIE|COMPLEMENT)\b/.test(text)) {
    return "health";
  }
  if (
    /\b(HYGIENE|BEAUTE|GEL DOUCHE|SHAMPOOING|DENTIFRICE|DEODORANT|BEBE|MATERNITE|COUCHE|LINGETTE)\b/.test(
      text,
    )
  ) {
    return "hygiene";
  }
  if (
    /\b(ENTRETIEN|NETTOYAGE|LESSIVE|DETERGENT|JAVEL|VAISSELLE|ASSOUPLISSANT|NETTOYANT|DEGRAISSANT|EPONGE|POUBELLE)\b/.test(
      text,
    )
  ) {
    return "cleaning";
  }
  if (/\b(MAISON|BRICOLAGE|JARDINAGE|ACCESSOIRE|USTENSILE|PILE|ELECTRIQUE|BOUGIE|BARBECUE)\b/.test(text)) {
    return "household";
  }
  return "food";
}

function isAnimalProduct(product: MyMarketApiProduct, animalIds: Set<string>) {
  if (animalIds.has(identifier(product.id))) return true;
  return normalized(product.product_type) === "ANIMAUX";
}

function toCatalogProduct(
  source: MyMarketApiProduct,
  animalIds: Set<string>,
): MyMarketCatalogProduct | null {
  const externalId = identifier(source.id);
  const name = cleanText(source.title);
  const handle = cleanText(source.handle, 180);
  const variants = Array.isArray(source.variants)
    ? (source.variants as MyMarketVariant[])
    : [];
  const variant = variants.find((entry) => entry.available === true);
  const price = Number(variant?.price);
  const priceCents = Math.round(price * 100);

  if (
    !externalId ||
    !name ||
    !handle ||
    !variant ||
    !Number.isFinite(price) ||
    priceCents <= 0 ||
    isAnimalProduct(source, animalIds)
  ) {
    return null;
  }

  const compareAtPrice = Number(variant.compare_at_price);
  const crossedPriceCents =
    Number.isFinite(compareAtPrice) && compareAtPrice > price
      ? Math.round(compareAtPrice * 100)
      : null;
  const featuredImage =
    variant.featured_image && typeof variant.featured_image === "object"
      ? variant.featured_image.src
      : null;
  const firstImage = Array.isArray(source.images)
    ? (source.images as MyMarketImage[])[0]?.src
    : null;

  return {
    external_id: externalId,
    name,
    category: appCategory(source),
    image_url: safeImageUrl(featuredImage ?? firstImage),
    price_cents: priceCents,
    crossed_price_cents: crossedPriceCents,
    package_size: packageSize(source.title),
    store: "MyMarket",
    handle,
  };
}

function toSearchCatalogProduct(
  source: MyMarketSearchProduct,
  animalIds: Set<string>,
): MyMarketCatalogProduct | null {
  const product: MyMarketApiProduct = {
    id: source.id,
    title: source.title,
    handle: source.handle,
    product_type: source.type,
    tags: source.tags,
  };
  const externalId = identifier(source.id);
  const name = cleanText(source.title);
  const handle = cleanText(source.handle, 180);
  const price = Number(source.price);
  const priceCents = Math.round(price * 100);

  if (
    source.available !== true ||
    !externalId ||
    !name ||
    !handle ||
    !Number.isFinite(price) ||
    priceCents <= 0 ||
    isAnimalProduct(product, animalIds)
  ) {
    return null;
  }

  const compareAtPrice = Number(source.compare_at_price_max);
  const crossedPriceCents =
    Number.isFinite(compareAtPrice) && compareAtPrice > price
      ? Math.round(compareAtPrice * 100)
      : null;

  return {
    external_id: externalId,
    name,
    category: appCategory(product),
    image_url: safeImageUrl(source.featured_image?.url ?? source.image),
    price_cents: priceCents,
    crossed_price_cents: crossedPriceCents,
    package_size: packageSize(source.title),
    store: "MyMarket",
    handle,
  };
}

async function fetchAnimalIds() {
  if (animalIdsCache && animalIdsCache.expiresAt > Date.now()) return animalIdsCache.ids;
  if (animalIdsRequest) return animalIdsRequest;

  animalIdsRequest = (async () => {
    const animals = await fetchCollection("animaux", "fr");
    const ids = new Set(animals.map((product) => identifier(product.id)).filter(Boolean));
    animalIdsCache = { expiresAt: Date.now() + CACHE_DURATION_MS, ids };
    return ids;
  })();

  try {
    return await animalIdsRequest;
  } finally {
    animalIdsRequest = null;
  }
}

async function fetchMyMarketCatalogue(language: Language) {
  const cached = catalogueCache.get(language);
  if (cached && cached.expiresAt > Date.now()) return cached.products;

  const pending = catalogueRequests.get(language);
  if (pending) return pending;

  const request = (async () => {
    const [sourceProducts, animalIds] = await Promise.all([
      fetchCollection("all", language),
      fetchAnimalIds(),
    ]);
    const products = sourceProducts
      .map((product) => toCatalogProduct(product, animalIds))
      .filter((product): product is MyMarketCatalogProduct => Boolean(product))
      .sort((left, right) => left.name.localeCompare(right.name, language));

    catalogueCache.set(language, {
      expiresAt: Date.now() + CACHE_DURATION_MS,
      products,
    });
    return products;
  })();
  catalogueRequests.set(language, request);

  try {
    return await request;
  } finally {
    catalogueRequests.delete(language);
  }
}

async function searchMyMarketCatalogue(query: string, preferredLanguage: Language) {
  const cacheKey = `${preferredLanguage}:${normalized(query)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.products;

  const languages = [
    preferredLanguage,
    ...(["fr", "ar", "en"] as Language[]).filter(
      (language) => language !== preferredLanguage,
    ),
  ];
  const queryVariants = searchQueryVariants(query);
  const [responses, animalIds] = await Promise.all([
    Promise.all(
      languages.flatMap((language) => queryVariants.map(async (queryVariant) => {
        try {
          return await fetchJson<MyMarketSearchResponse>(
            searchUrl(queryVariant, language),
            "La recherche MyMarket est momentanément indisponible.",
          );
        } catch {
          return null;
        }
      })),
    ),
    fetchAnimalIds(),
  ]);
  if (responses.every((response) => response === null)) {
    throw new Error("La recherche MyMarket est momentanément indisponible.");
  }
  const products = new Map<string, MyMarketCatalogProduct>();

  for (const response of responses) {
    if (!response) continue;
    const results = response.resources?.results?.products;
    if (!Array.isArray(results)) {
      throw new Error("Le format de recherche MyMarket a changé.");
    }
    for (const source of results) {
      const product = toSearchCatalogProduct(source, animalIds);
      if (!product) continue;
      const existing = products.get(product.external_id);
      if (existing) {
        existing.search_text = `${existing.search_text ?? existing.name} ${product.name}`;
      } else {
        product.search_text = product.name;
        products.set(product.external_id, product);
      }
    }
  }

  const searchResults = [...products.values()];
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_DURATION_MS,
    products: searchResults,
  });
  return searchResults;
}

function requestedLanguage(request: Request): Language {
  const value = new URL(request.url).searchParams.get("lang");
  return value === "ar" || value === "en" ? value : "fr";
}

async function localizedProductName(handle: string, language: Language, fallback: string) {
  try {
    const product = await fetchJson<MyMarketApiProduct>(
      productUrl(handle, language),
      "Le produit MyMarket est momentanément indisponible.",
    );
    return cleanText(product.title) || fallback;
  } catch {
    return fallback;
  }
}

async function requireMember(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return { response: Response.json({ error: "Connexion requise." }, { status: 401 }) };
  if (viewer.role !== "member") {
    return {
      response: Response.json(
        { error: "Le catalogue MyMarket est réservé aux membres." },
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
    const language = requestedLanguage(request);
    const query = cleanText(new URL(request.url).searchParams.get("q"), 120);
    const products = query
      ? await searchMyMarketCatalogue(query, language)
      : await fetchMyMarketCatalogue(language);
    return Response.json(
      {
        products: products.map((product) => ({
          external_id: product.external_id,
          name: product.name,
          search_text: product.search_text ?? product.name,
          category: product.category,
          image_url: product.image_url,
          price_cents: product.price_cents,
          crossed_price_cents: product.crossed_price_cents,
          package_size: product.package_size,
          store: product.store,
        })),
        excluded_category: "animals",
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue MyMarket indisponible.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const access = await requireMember(request);
  if ("response" in access) return access.response;

  try {
    const db = getSupabaseAdmin();
    const body = (await request.json()) as { externalId?: unknown };
    const externalId = identifier(body.externalId);
    if (!externalId) {
      return Response.json({ error: "Le produit MyMarket est invalide." }, { status: 400 });
    }

    const catalogue = await fetchMyMarketCatalogue("fr");
    const source = catalogue.find((product) => product.external_id === externalId);
    if (!source) {
      return Response.json(
        { error: "Ce produit n’est plus disponible dans le catalogue autorisé." },
        { status: 404 },
      );
    }

    const [nameFr, nameAr, nameEn] = await Promise.all([
      localizedProductName(source.handle, "fr", source.name),
      localizedProductName(source.handle, "ar", source.name),
      localizedProductName(source.handle, "en", source.name),
    ]);

    const { data: existing, error: existingError } = await db
      .from("products")
      .select("id, purchase_count")
      .eq("external_source", "mymarket")
      .eq("external_id", source.external_id)
      .maybeSingle();
    throwIfSupabaseError(existingError);

    const { error: upsertError } = await db.from("products").upsert(
      {
        name_fr: nameFr,
        name_ar: nameAr,
        name_en: nameEn,
        category: source.category,
        unit: "pièce",
        unit_price_cents: source.price_cents,
        image_position: "0% 0%",
        image_url: source.image_url,
        package_size: source.package_size,
        external_source: "mymarket",
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
      .eq("external_source", "mymarket")
      .eq("external_id", source.external_id)
      .eq("active", true)
      .maybeSingle();
    throwIfSupabaseError(productError);
    if (!product) throw new Error("Le produit MyMarket n’a pas pu être enregistré.");

    return Response.json({ product, imported: !existing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import MyMarket impossible.";
    return Response.json({ error: message }, { status: 502 });
  }
}
