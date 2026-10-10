import { test, expect } from "bun:test";
import { contextControls, medicalPitch } from "./fixtures/laya-context-controls";
import { toModerationMessage } from "./message";
import { JevSpamClassifier } from "./spam";
import { evaluateWeekend } from "./laya-weekend-evaluation";

test("fresh staffing pair changes only source ownership or request", () => {
  const [unrelated, requested, self] = contextControls.slice(0, 3).map(f => toModerationMessage(f.raw)!);
  expect(unrelated!.text).toBe(requested!.text);
  expect(self!.text).toBe(requested!.text);
  expect(requested!.preview![0]!.sourceAuthor).toBe("other_author");
  expect(self!.preview![0]!.sourceAuthor).toBe("same_author");
  expect(self!.preview![0]!.text).toBe(requested!.preview![0]!.text);
});

test("medical synthetic warning retains pitch as source, never current speech", () => {
  const warning = toModerationMessage(contextControls.find(f => f.id === "medical-warning")!.raw)!;
  expect(warning.text).not.toContain(medicalPitch);
  expect(warning.preview![0]!.text).toBe(medicalPitch);
  expect(warning.preview![0]!.sourceAuthor).toBe("other_author");
  const ad = toModerationMessage(contextControls.find(f => f.id === "medical-promotion")!.raw)!;
  expect(ad.isForwarded).toBe(true);
  expect(ad.text).toBe(medicalPitch);
});

test("all fresh cases preserve normalized state and pass complete parser contract offline", async () => {
  for (const fixture of contextControls) {
    let state: unknown;
    const classifier = new JevSpamClassifier("offline", { model: "laya-jev-ckpt-v2", threshold: .80,
      url: "http://offline.invalid/v1/systemone", timeoutMs: 1000, fetch: async (_url, init) => {
        const request = JSON.parse(String(init!.body)); state = request.state;
        return Response.json({ model: "laya-jev-ckpt-v2", usage: { truncated: false },
          answers: Object.fromEntries(Object.keys(request.questions).map(k => [k, { type: "noul", noul: .1 }])) });
      } });
    const row = await evaluateWeekend(classifier, fixture, "laya-jev-ckpt-v2");
    expect(state).toEqual({ message: toModerationMessage(fixture.raw), recentMessages: [] });
    expect(JSON.stringify(state)).not.toContain("expectedDelete");
    expect(row.selectedMessageIds).toEqual([]);
    expect(row.accepted).toBe(!fixture.expectedDelete); // Mock proves parser, not model accuracy.
  }
});
