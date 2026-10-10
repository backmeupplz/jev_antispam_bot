import { weekendFixtures, weekendHistoryFixtures } from "./fixtures/laya-weekend-recruitment";
import { contextControls } from "./fixtures/laya-context-controls";
export const contextFixtures = [...weekendFixtures, ...weekendHistoryFixtures, ...contextControls];
export const contextVariants = ["base", "schema-attribution", "forward-policy"] as const;
export type ContextResponse = { variant: string; id: string; response: unknown };

// Validate the entire evidence matrix before parsing, writing or summarizing any row.
export function validateContextMatrix(value: unknown): ContextResponse[] {
  if (!Array.isArray(value) || value.length !== contextVariants.length * contextFixtures.length)
    throw new Error("Expected exact 3 x 25 response matrix");
  const ids = new Set(contextFixtures.map(f => f.id));
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || !contextVariants.includes(row.variant)
      || !ids.has(row.id) || !Object.hasOwn(row, "response")) throw new Error("Unknown variant, fixture or missing response");
    const key = row.variant + ":" + row.id;
    if (seen.has(key)) throw new Error("Duplicate variant-fixture response");
    seen.add(key);
  }
  for (const variant of contextVariants) for (const id of ids)
    if (!seen.has(variant + ":" + id)) throw new Error("Missing variant-fixture response");
  return value;
}
