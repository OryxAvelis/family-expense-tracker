import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export type FamilyMetaEntry = { key: string; value: string };

export async function readFamilyMeta(familyId: string, keys?: string[]) {
  let query = getSupabaseAdmin()
    .from("family_meta")
    .select("key, value")
    .eq("family_id", familyId);
  if (keys) {
    if (!keys.length) return [] as FamilyMetaEntry[];
    query = query.in("key", keys);
  }
  const { data, error } = await query;
  throwIfSupabaseError(error);
  return (data ?? []).map((entry) => ({ key: String(entry.key), value: String(entry.value) }));
}

export async function readFamilyMetaValue(familyId: string, key: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("family_meta")
    .select("value")
    .eq("family_id", familyId)
    .eq("key", key)
    .maybeSingle();
  throwIfSupabaseError(error);
  return data?.value === undefined ? undefined : String(data.value);
}

export async function upsertFamilyMeta(familyId: string, entries: FamilyMetaEntry | FamilyMetaEntry[]) {
  const values = (Array.isArray(entries) ? entries : [entries]).map((entry) => ({
    family_id: familyId,
    key: entry.key,
    value: entry.value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await getSupabaseAdmin()
    .from("family_meta")
    .upsert(values, { onConflict: "family_id,key" });
  throwIfSupabaseError(error);
}

export async function deleteFamilyMeta(familyId: string, keys: string[]) {
  if (!keys.length) return;
  const { error } = await getSupabaseAdmin()
    .from("family_meta")
    .delete()
    .eq("family_id", familyId)
    .in("key", keys);
  throwIfSupabaseError(error);
}
