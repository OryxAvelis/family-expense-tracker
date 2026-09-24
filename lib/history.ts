type CompletedRecord = { id: number | string; completed_at: string | null };

function completionTime(record: CompletedRecord) {
  const time = record.completed_at ? Date.parse(record.completed_at) : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

/** Never reuse queue priority or creation order for completed work. Unknown dates go last. */
export function newestCompletedFirst(a: CompletedRecord, b: CompletedRecord) {
  const first = completionTime(a), second = completionTime(b);
  if (first !== second) return first > second ? -1 : 1;
  return String(b.id).localeCompare(String(a.id), "en", { numeric: true });
}

/** Date inputs and displayed completion times both use the household's local day. */
export function completionDay(completedAt: string | null) {
  if (!completedAt || !Number.isFinite(Date.parse(completedAt))) return "";
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(completedAt));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function matchesHistoryFilters(record: { completed_at: string | null; memberId: number }, memberId: string, from: string, to: string) {
  if (memberId && String(record.memberId) !== memberId) return false;
  if (!from && !to) return true;
  const day = completionDay(record.completed_at);
  return Boolean(day) && (!from || day >= from) && (!to || day <= to);
}
