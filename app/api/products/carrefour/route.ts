import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CARREFOUR_API =
  "https://backend.carrefour.ma/api/products?isPromotion=true&status=active&limit=1000&page=1";
const MAX_PRICE_CENTS = 50_000;
const CACHE_DURATION_MS = 5 * 60 * 1000;

type CarrefourApiProduct = {
  id?: unknown;
  name?: unknown;
  mainImageUrl?: unknown;
  price?: unknown;
  crossedPrice?: unknown;
  status?: unknown;
  isActive?: unknown;
  primaryCategory?: unknown;
  secondaryCategory?: unknown;
  tertiaryCategory?: unknown;
  enseigne?: { name?: unknown } | null;
};

type CarrefourApiResponse = {
  products?: CarrefourApiProduct[];
};

type CarrefourCatalogProduct = {
  external_id: string;
  name: string;
  category: "food" | "cleaning" | "hygiene" | "school" | "household" | "health";
  image_url: string | null;
  price_cents: number;
  crossed_price_cents: number | null;
  package_size: string | null;
  store: string;
};

const localProductColumns = `id, name_fr, name_ar, name_en, category, unit,
  unit_price_cents, image_position, image_url, barcode, package_size,
  external_source, external_id, purchase_count`;

let catalogueCache: { expiresAt: number; products: CarrefourCatalogProduct[] } | null = null;

function cleanText(value: unknown, maximum = 160) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function normalized(value: unknown) {
  return cleanText(value, 220)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function safeImageUrl(value: unknown) {
  const raw = cleanText(value, 500);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const approvedStorageImage =
      parsed.hostname === "storage.googleapis.com" &&
      parsed.pathname.startsWith("/crftobringo-sharing-ma-prelive/");
    const approvedCarrefourImage =
      parsed.hostname === "backend.carrefour.ma" || parsed.hostname === "assets.carrefour.ma";
    return parsed.protocol === "https:" && (approvedStorageImage || approvedCarrefourImage)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function isElectricalProduct(product: CarrefourApiProduct) {
  const categories = normalized(
    [product.primaryCategory, product.secondaryCategory, product.tertiaryCategory]
      .map((value) => cleanText(value))
      .join(" "),
  );
  if (
    /\b(P\.?E\.?M\.?|ELECTROMENAGER|ELECTRONIQUE|MULTIMEDIA|HIGH TECH|TELEPHONIE)\b/.test(
      categories,
    )
  ) {
    return true;
  }

  const name = normalized(product.name);
  return /\b(ELECTRIQUES?|BLENDER|MIXEUR|CAFETIERE|CAFT A FILTRE|BOUILLOIRE|GRILLE PAIN|ASPIRATEUR|MICRO ONDES?|REFRIGERATEUR|CONGELATEUR|VENTILATEUR|CLIMATISEUR|FER A REPASSER|SECHE CHEVEUX|FRITEUSE|BATTEUR|HACHOIR|ROBOT CUISINE|MACHINE A CAFE|MACHINE A LAVER|SMARTPHONE|TELEPHONE|ORDINATEUR|TELEVISEUR|ECOUTEURS?|CASQUE BLUETOOTH|CHARGEUR|CABLE USB|AMPOULE|LAMPE LED|MULTIPRISE|RALLONGE)\b/.test(
    name,
  );
}

function appCategory(product: CarrefourApiProduct): CarrefourCatalogProduct["category"] {
  const text = normalized(
    [
      product.primaryCategory,
      product.secondaryCategory,
      product.tertiaryCategory,
      product.name,
    ]
      .map((value) => cleanText(value))
      .join(" "),
  );

  if (/\b(CAHIER|STYLO|CRAYON|SCOLAIRE|PAPETERIE|ECOLE)\b/.test(text)) return "school";
  if (/\b(PHARMACIE|SANTE|VITAMINE|PANSEMENT|PARAPHARMACIE)\b/.test(text)) return "health";
  if (/\b(ENTRETIEN|NETTOYAGE|LESSIVE|DETERGENT|JAVEL|VAISSELLE)\b/.test(text)) return "cleaning";
  if (/\b(HYGIENE|BEAUTE|COSMETIQUE|SHAMPOOING|DENTIFRICE|DEODORANT|BEBE)\b/.test(text)) {
    return "hygiene";
  }
  if (/\b(MA MAISON|VETEMENTS|TEXTILE|LOISIRS|ANIMAUX|MENAGE)\b/.test(text)) return "household";
  return "food";
}

function readableName(value: unknown) {
  const name = cleanText(value);
  if (!name) return "";
  if (name !== name.toUpperCase()) return name;
  const lower = name.toLocaleLowerCase("fr");
  return `${lower.charAt(0).toLocaleUpperCase("fr")}${lower.slice(1)}`;
}

function packageSize(value: unknown) {
  const name = cleanText(value);
  const match = name.match(
    /(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:ml|cl|l|kg|g|mg|pi[eè]ces?|pcs?|unit[eé]s?)\b/i,
  );
  return match ? match[0].replace(/\s+/g, " ") : null;
}

function toCatalogProduct(source: CarrefourApiProduct): CarrefourCatalogProduct | null {
  const externalId = cleanText(source.id, 100);
  const name = readableName(source.name);
  const price = Number(source.price);
  const priceCents = Math.round(price * 100);
  if (
    !externalId ||
    !name ||
    !Number.isFinite(price) ||
    priceCents <= 0 ||
    priceCents > MAX_PRICE_CENTS ||
    source.isActive === false ||
    normalized(source.status) === "OUT_OF_STOCK" ||
    isElectricalProduct(source)
  ) {
    return null;
  }

  const crossedPrice = Number(source.crossedPrice);
  const crossedPriceCents = Number.isFinite(crossedPrice) && crossedPrice > price
    ? Math.round(crossedPrice * 100)
    : null;

  return {
    external_id: externalId,
    name,
    category: appCategory(source),
    image_url: safeImageUrl(source.mainImageUrl),
    price_cents: priceCents,
    crossed_price_cents: crossedPriceCents,
    package_size: packageSize(source.name),
    store: cleanText(source.enseigne?.name, 80) || "Carrefour",
  };
}

async function fetchCarrefourCatalogue() {
  if (catalogueCache && catalogueCache.expiresAt > Date.now()) return catalogueCache.products;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(CARREFOUR_API, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "FamilyExpenseTracker/0.1 (https://github.com/OryxAvelis/family-expense-tracker)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    throw new Error("Le catalogue Carrefour est momentanément indisponible.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error("Le catalogue Carrefour ne répond pas correctement.");
  const payload = (await response.json()) as CarrefourApiResponse;
  if (!Array.isArray(payload.products)) throw new Error("Le format du catalogue Carrefour a changé.");

  const products = payload.products
    .map(toCatalogProduct)
    .filter((product): product is CarrefourCatalogProduct => Boolean(product))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  catalogueCache = { expiresAt: Date.now() + CACHE_DURATION_MS, products };
  return products;
}

async function requireMember(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return { response: Response.json({ error: "Connexion requise." }, { status: 401 }) };
  if (viewer.role !== "member") {
    return {
      response: Response.json(
        { error: "Le catalogue Carrefour est réservé aux membres." },
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
    const products = await fetchCarrefourCatalogue();
    return Response.json(
      { products, max_price_cents: MAX_PRICE_CENTS },
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
    const db = getSupabaseAdmin();
    const body = (await request.json()) as { externalId?: unknown };
    const externalId = cleanText(body.externalId, 100);
    if (!externalId) {
      return Response.json({ error: "Le produit Carrefour est invalide." }, { status: 400 });
    }

    const catalogue = await fetchCarrefourCatalogue();
    const source = catalogue.find((product) => product.external_id === externalId);
    if (!source) {
      return Response.json(
        { error: "Ce produit n’est plus disponible dans le catalogue autorisé." },
        { status: 404 },
      );
    }

    const { data: existing, error: existingError } = await db
      .from("products")
      .select("id, purchase_count")
      .eq("external_source", "carrefour")
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
        external_source: "carrefour",
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
      .eq("external_source", "carrefour")
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
