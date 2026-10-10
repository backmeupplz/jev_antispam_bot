import { weekendFixtures, weekendHistoryFixtures } from "../src/fixtures/laya-weekend-recruitment";
import { contextControls } from "../src/fixtures/laya-context-controls";
import { evaluateWeekend } from "../src/laya-weekend-evaluation";
import { JevSpamClassifier } from "../src/spam";
const fixtures = [...weekendFixtures, ...weekendHistoryFixtures, ...contextControls];
const [mode, path] = process.argv.slice(2);
if (!path || !["prepare", "parse"].includes(mode!)) throw new Error("prepare REQUESTS or parse RESPONSES; offline files only");
if (mode === "prepare") {
  const rows = [];
  for (const fixture of fixtures) {
    let request: unknown;
    const classifier = new JevSpamClassifier("offline", { model: "laya-jev-ckpt-v2", threshold: .80,
      url: "http://offline.invalid/v1/systemone", timeoutMs: 1000, fetch: async (_url, init) => {
        const body = JSON.parse(String(init!.body)); request = body;
        return Response.json({ model: "laya-jev-ckpt-v2", usage: { truncated: false },
          answers: Object.fromEntries(Object.keys(body.questions).map(k => [k, { type: "noul", noul: 0 }])) });
      } });
    await evaluateWeekend(classifier, fixture, "laya-jev-ckpt-v2");
    rows.push({ id: fixture.id, synthetic: true, expected: fixture.expectedDelete, expectedContextLinks: fixture.expectedContextLinks, request });
  }
  await Bun.write(path, JSON.stringify(rows, null, 2));
} else {
  const rows = await Bun.file(path).json() as { variant: string; id: string; response: unknown }[];
  const parsed = [];
  for (const row of rows) {
    const fixture = fixtures.find(f => f.id === row.id);
    if (!fixture) throw new Error("Unknown fixture");
    const classifier = new JevSpamClassifier("offline", { model: "laya-jev-ckpt-v2", threshold: .80,
      url: "http://offline.invalid/v1/systemone", timeoutMs: 1000, fetch: async () => Response.json(row.response) });
    parsed.push({ variant: row.variant, ...await evaluateWeekend(classifier, fixture, "laya-jev-ckpt-v2") });
  }
  await Bun.write(path + ".parsed.json", JSON.stringify(parsed, null, 2));
  for (const variant of new Set(parsed.map(r => r.variant))) console.log(JSON.stringify({ variant,
    cases: parsed.filter(r => r.variant === variant).length,
    failures: parsed.filter(r => r.variant === variant && !r.accepted).map(r => ({ id: r.id, p: r.probability, links: r.contextProbabilities })) }));
}
