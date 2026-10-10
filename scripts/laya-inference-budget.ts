import { budgetFixtures as fixtures, budgetVariants, type BudgetFixture } from "../src/fixtures/laya-inference-budget";
import { evaluateWeekend } from "../src/laya-weekend-evaluation";
import { JevSpamClassifier } from "../src/spam";

export function validateMatrix(value: unknown): { variant: string; id: string; response: unknown }[] {
  if (!Array.isArray(value) || value.length !== fixtures.length * budgetVariants.length) throw new Error("Incomplete matrix");
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || !budgetVariants.includes(row.variant) || !fixtures.some(f => f.id === row.id) || !Object.hasOwn(row, "response")) throw new Error("Unknown row");
    const key = row.variant + ":" + row.id;
    if (seen.has(key)) throw new Error("Duplicate row");
    seen.add(key);
  }
  return value;
}
function classifier(f: BudgetFixture, getResponse: (body: any) => unknown) {
  return new JevSpamClassifier("offline", { model: "laya-jev-ckpt-v2", threshold: .80,
    url: "http://offline.invalid/v1/systemone", timeoutMs: 1000, fetch: async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      // Explicit manual synthetic availability branch, never a production fetch or
      // invented Bot API field. Existing schema/normalizer/request values preserved.
      if (f.suppliedPreviews) body.state.message.destinationPreviews = f.suppliedPreviews;
      return Response.json(getResponse(body));
    } });
}
if (import.meta.main) {
  const [mode, path] = process.argv.slice(2);
  if (!path || !["prepare", "parse"].includes(mode!)) throw new Error("prepare REQUESTS or parse RESPONSES");
  if (mode === "prepare") {
    const rows = [];
    for (const f of fixtures) {
      let request: unknown;
      await evaluateWeekend(classifier(f, body => {
        request = body;
        return { model: "laya-jev-ckpt-v2", usage: { truncated: false }, answers: Object.fromEntries(Object.keys(body.questions).map(k => [k, { type: "noul", noul: 0 }])) };
      }), f, "laya-jev-ckpt-v2");
      rows.push({ id: f.id, expected: f.expectedDelete, expectedContextLinks: f.expectedContextLinks, tail: f.tail ?? null,
        manualPreviewAvailability: Boolean(f.suppliedPreviews), synthetic: true, request });
    }
    await Bun.write(path, JSON.stringify(rows, null, 2));
  } else {
    const rows = validateMatrix(await Bun.file(path).json());
    const parsed = [];
    for (const row of rows) {
      const f = fixtures.find(f => f.id === row.id)!;
      parsed.push({ variant: row.variant, ...await evaluateWeekend(classifier(f, () => row.response), f, "laya-jev-ckpt-v2") });
    }
    await Bun.write(path + ".parsed.json", JSON.stringify(parsed, null, 2));
    for (const variant of budgetVariants) {
      const group = parsed.filter(r => r.variant === variant);
      console.log(JSON.stringify({ variant, cases: group.length, fp: group.filter(r => r.shouldDelete && !r.expectedDelete).map(r => r.id),
        fn: group.filter(r => !r.shouldDelete && r.expectedDelete).map(r => r.id), failures: group.filter(r => !r.accepted).map(r => ({ id: r.id, p: r.probability, links: r.contextProbabilities, truncated: r.truncated })) }));
    }
  }
}
