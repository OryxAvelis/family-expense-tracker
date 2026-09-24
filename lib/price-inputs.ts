export type PriceInputs = Record<number, string>;

/** Refresh untouched fields, preserving drafts until their own save succeeds. */
export function reconcilePriceInputs(
  current: PriceInputs,
  previousSaved: PriceInputs,
  nextSaved: PriceInputs,
  submitted: PriceInputs = {},
): PriceInputs {
  return Object.fromEntries(
    Object.entries(nextSaved).map(([key, savedValue]) => {
      const id = Number(key);
      const value = current[id];
      const hasUnsavedEdit = value !== undefined && value !== previousSaved[id];
      // Do not clear a newer edit made while the save was in flight.
      const savedThisEdit = id in submitted && value === submitted[id];
      return [id, hasUnsavedEdit && !savedThisEdit ? value : savedValue];
    }),
  );
}

/** Capture only the fields affected by this mutation, before awaiting its response. */
export function submittedPriceInputs(
  body: Record<string, unknown>,
  products: PriceInputs,
  items: PriceInputs,
): { products: PriceInputs; items: PriceInputs } {
  const submitted = { products: {} as PriceInputs, items: {} as PriceInputs };
  const capture = (target: PriceInputs, source: PriceInputs, value: unknown) => {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id in source) target[id] = source[id];
  };

  if (body.action === "update_product" || body.action === "edit_product") {
    capture(submitted.products, products, body.productId);
  } else if (body.action === "update_item") {
    capture(submitted.items, items, body.itemId);
  } else if (body.action === "apply_receipt_suggestions" && Array.isArray(body.suggestions)) {
    for (const suggestion of body.suggestions) {
      if (suggestion && typeof suggestion === "object") {
        capture(submitted.items, items, suggestion.itemId);
      }
    }
  }

  return submitted;
}
