import { env } from "cloudflare:workers";

import { getRequestFamilyUser } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

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

type CatalogProduct = {
  id: number;
  name_fr: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit: "pièce";
  unit_price_cents: number;
  image_position: string;
  image_url: string | null;
  barcode: string | null;
  package_size: string | null;
  purchase_count: number;
};

const productColumns = `id, name_fr, name_ar, name_en, category, unit,
  unit_price_cents, image_position, image_url, barcode, package_size, purchase_count`;

function cleanText(value: unknown, maximum = 120) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function safeImageUrl(value: unknown) {
  const raw = cleanText(value, 500);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const isOpenFoodFacts =
      parsed.hostname === "openfoodfacts.org" ||
      parsed.hostname.endsWith(".openfoodfacts.org");
    return parsed.protocol === "https:" && isOpenFoodFacts ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeBarcode(value: unknown) {
  const barcode = typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
  return /^\d{8,14}$/.test(barcode) ? barcode : "";
}

export async function POST(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (viewer.role !== "member") {
    return Response.json({ error: "Cette fonction est réservée aux membres." }, { status: 403 });
  }
  if (!env.DB) {
    return Response.json({ error: "La base de données est indisponible." }, { status: 500 });
  }

  try {
    const body = (await request.json()) as { barcode?: unknown };
    const barcode = normalizeBarcode(body.barcode);
    if (!barcode) {
      return Response.json({ error: "Le code-barres doit contenir entre 8 et 14 chiffres." }, { status: 400 });
    }

    const existing = await env.DB.prepare(
      `SELECT ${productColumns} FROM products WHERE barcode = ? AND active = 1`,
    )
      .bind(barcode)
      .first<CatalogProduct>();
    if (existing) return Response.json({ product: existing, imported: false });

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
            "FamilyExpenseTracker/0.1 (https://github.com/OryxAvelis/family-expense-tracker)",
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch {
      return Response.json(
        { error: "Open Food Facts est momentanément indisponible. Réessayez ou ajoutez le produit manuellement." },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (remoteResponse.status === 404) {
      return Response.json(
        { error: "Produit introuvable dans Open Food Facts. Ajoutez-le manuellement depuis l’admin." },
        { status: 404 },
      );
    }
    if (!remoteResponse.ok) {
      return Response.json(
        { error: "Open Food Facts ne répond pas correctement. Réessayez plus tard." },
        { status: 502 },
      );
    }

    const remote = (await remoteResponse.json()) as OpenFoodFactsResponse;
    const source = remote.product;
    if (!source || remote.result?.id !== "product_found") {
      return Response.json(
        { error: "Produit introuvable dans Open Food Facts. Ajoutez-le manuellement depuis l’admin." },
        { status: 404 },
      );
    }

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
    const packageSize = cleanText(source.quantity, 60) || null;
    const imageUrl = safeImageUrl(source.image_front_small_url);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO products
       (name_fr, name_ar, name_en, category, unit, unit_price_cents, image_position,
        image_url, barcode, package_size, purchase_count, active)
       VALUES (?, ?, ?, 'food', 'pièce', 0, '0% 0%', ?, ?, ?, 0, 1)`,
    )
      .bind(nameFr, nameAr, nameEn, imageUrl, barcode, packageSize)
      .run();

    const product = await env.DB.prepare(
      `SELECT ${productColumns} FROM products WHERE barcode = ? AND active = 1`,
    )
      .bind(barcode)
      .first<CatalogProduct>();
    if (!product) throw new Error("Le produit n’a pas pu être enregistré.");

    return Response.json({ product, imported: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture du code-barres impossible.";
    return Response.json({ error: message }, { status: 400 });
  }
}
