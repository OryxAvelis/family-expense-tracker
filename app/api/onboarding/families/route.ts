import {
  createDarnaFlowFamily,
  FamilyOnboardingError,
  type DarnaFlowLocale,
} from "@/lib/darnaflow-onboarding";
import { consumeFamilyAuthAttempt } from "@/lib/family-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
};

function errorResponse(error: string, code: string, status: number, extraHeaders?: HeadersInit) {
  return Response.json(
    { error, code },
    { status, headers: { ...noStoreHeaders, ...extraHeaders } },
  );
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 16_384) {
      return errorResponse("La demande est trop volumineuse.", "PAYLOAD_TOO_LARGE", 413);
    }

    const limiter = await consumeFamilyAuthAttempt(request, "signup", 5, 60 * 60);
    if (!limiter.allowed) {
      return errorResponse(
        "Trop de créations de famille. Réessayez plus tard.",
        "RATE_LIMITED",
        429,
        { "retry-after": String(limiter.retryAfterSeconds) },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const requestId = request.headers.get("idempotency-key")?.trim() ?? "";
    const result = await createDarnaFlowFamily({
      requestId,
      familyName: typeof body.familyName === "string" ? body.familyName : "",
      ownerName: typeof body.ownerName === "string" ? body.ownerName : "",
      username: typeof body.username === "string" ? body.username : "",
      pin: typeof body.pin === "string" ? body.pin : "",
      locale: (typeof body.locale === "string" ? body.locale : "fr") as DarnaFlowLocale,
    });

    return Response.json(
      {
        created: true,
        status: result.status,
        familyCode: result.familyCode,
        supportRef: result.supportRef,
      },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof FamilyOnboardingError) {
      const status = error.code === "ONBOARDING_CONFLICT"
        ? 409
        : error.code === "ONBOARDING_NOT_READY"
          ? 503
          : 400;
      return errorResponse(error.message, error.code, status);
    }

    return errorResponse(
      "La création de la famille est momentanément indisponible.",
      "INTERNAL_ERROR",
      500,
    );
  }
}
