import { expect, test } from "bun:test";
import { budgetFixtures, budgetVariants, fullMedicalText } from "./fixtures/laya-inference-budget";
import { validateMatrix } from "../scripts/laya-inference-budget";
import { toModerationMessage } from "./message";
test("frozen matrix is unique, complete and rejects duplicates", () => {
 const rows = budgetVariants.flatMap(variant => budgetFixtures.map(f => ({ variant, id: f.id, response: {} })));
 expect(rows.length).toBe(210);
 expect(validateMatrix(rows)).toBe(rows);
 expect(() => validateMatrix(rows.slice(1))).toThrow();
 expect(() => validateMatrix([rows[0], ...rows.slice(0, -1)])).toThrow();
 expect(() => validateMatrix([{ ...rows[0], id: "invented" }, ...rows.slice(1)])).toThrow();
});
test("full screenshot body, separate card and long tail survive bot normalization", () => {
 expect(fullMedicalText.length).toBe(1252);
 for (const f of budgetFixtures) {
  const normalized = toModerationMessage(f.raw)!;
  if (f.tail) expect(normalized.text).toContain(f.tail);
  expect(normalized.text.length).toBeLessThanOrEqual(4096);
  if (f.id === "full-medical-card") { expect(f.suppliedPreviews![0]!.description).toContain("CANCER"); expect(normalized.text).not.toContain("CANCER"); }
 }
});
