import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextFixtures, contextVariants, validateContextMatrix } from "./laya-context-matrix";
const complete = () => contextVariants.flatMap(variant => contextFixtures.map(f => ({ variant, id: f.id, response: {} })));

test("exact 3x25 matrix accepts any ordering", () => {
  expect(complete()).toHaveLength(75);
  expect(validateContextMatrix(complete().reverse())).toHaveLength(75);
});
const invalid = {
  empty: () => [],
  missing: () => complete().slice(1),
  duplicate: () => { const rows = complete(); rows[1] = rows[0]!; return rows; },
  "unknown variant": () => complete().map((r, i) => i === 0 ? { ...r, variant: "unregistered" } : r),
  "unknown fixture": () => complete().map((r, i) => i === 0 ? { ...r, id: "unregistered" } : r),
};
for (const [name, rows] of Object.entries(invalid)) {
  test("rejects " + name + " before output or replacing evidence", async () => {
    expect(() => validateContextMatrix(rows())).toThrow();
    const dir = await mkdtemp(join(tmpdir(), "laya-matrix-"));
    const path = join(dir, "responses.json");
    try {
      await Bun.write(path, JSON.stringify(rows()));
      await Bun.write(path + ".parsed.json", "existing-evidence");
      const child = Bun.spawn([process.execPath, "run", new URL("../scripts/laya-context-diagnostic.ts", import.meta.url).pathname, "parse", path], { stdout: "pipe", stderr: "pipe" });
      const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code).not.toBe(0);
      expect(stdout).toBe("");
      expect(await Bun.file(path + ".parsed.json").text()).toBe("existing-evidence");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
