import { env } from "cloudflare:workers";

import { getRequestFamilyUser } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_KEY_PATTERN =
  /^product-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

function getBucket() {
  if (!env.BUCKET) throw new Error("Le stockage des images est indisponible.");
  return env.BUCKET;
}

function imageType(bytes: Uint8Array) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { contentType: "image/jpeg", extension: "jpg" } as const;

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return { contentType: "image/png", extension: "png" } as const;

  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isWebp) return { contentType: "image/webp", extension: "webp" } as const;

  return null;
}

function imageKey(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  return IMAGE_KEY_PATTERN.test(key) ? key : null;
}

export async function GET(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  const key = imageKey(request);
  if (!key) return Response.json({ error: "Image invalide." }, { status: 400 });

  try {
    const object = await getBucket().get(key);
    if (!object) return Response.json({ error: "Image introuvable." }, { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image indisponible.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (viewer.role !== "admin") {
    return Response.json({ error: "Action réservée à l’administrateur." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return Response.json({ error: "Choisissez une image." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "L’image ne doit pas dépasser 5 Mo." }, { status: 413 });
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const type = imageType(bytes);
    if (!type) {
      return Response.json(
        { error: "Choisissez une image JPG, PNG ou WebP." },
        { status: 415 },
      );
    }

    const key = `product-images/${crypto.randomUUID()}.${type.extension}`;
    await getBucket().put(key, bytes, {
      httpMetadata: {
        contentType: type.contentType,
        cacheControl: "private, max-age=31536000, immutable",
      },
    });

    return Response.json({ imageUrl: `/api/products/images?key=${encodeURIComponent(key)}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi de l’image impossible.";
    return Response.json({ error: message }, { status: 500 });
  }
}
