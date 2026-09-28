import { expect, test } from "bun:test";
import { careEvaluationCases, evaluateCare } from "./paid-care-evaluation";
import { JevSpamClassifier, SPAM_QUESTIONS } from "./spam";

const options = { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 1_000 };
function response(score: number, links: number[]) {
  return { model: options.model, answers: Object.fromEntries([
    ...Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: key === "unsolicited_paid_care_recruitment" ? score : 0.01 }]),
    ...links.map((noul, index) => ["context_message_" + index, { type: "noul", noul }]),
  ]) };
}
// Artificial answers prove builder/parser/selector behavior, not model accuracy.
for (const fixture of careEvaluationCases) {
  test("care evaluation uses actual complete contract: " + fixture[0], async () => {
    const classifier = new JevSpamClassifier("test-only", { ...options, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe(options.model);
      expect(body.state).toEqual({ message: fixture[1], recentMessages: fixture[2] });
      expect(Object.keys(body.questions)).toEqual([
        ...Object.keys(SPAM_QUESTIONS), ...fixture[2].map((_, i) => "context_message_" + i),
      ]);
      return Response.json(response(0.899, fixture[2].map(() => 0.99)));
    } });
    const result = await evaluateCare(classifier, fixture);
    expect(result.shouldDelete).toBe(false);
    expect(result.contextProbabilities).toHaveLength(fixture[2].length);
    expect(result.selectedMessageIds).toEqual([]);
  });
}
const mixed = careEvaluationCases.find(([name]) => name === "mixed")!;
test("care evaluation separates current gate and contiguous suffix including a requested barrier", async () => {
  for (const [score, links, ids] of [
    [0.899, [0.99, 0.99, 0.99], []],
    [0.9, [0.1, 0.75, 0.8], [2, 3, 4]],
    [0.9, [0.99, 0.1, 0.8], [3, 4]],
    [0.9, [0.99, 0.99, 0.749], [4]],
  ] as [number, number[], number[]][]) {
    const classifier = new JevSpamClassifier("test-only", { ...options, fetch: async () => Response.json(response(score, links)) });
    const result = await evaluateCare(classifier, mixed);
    expect(result.selectedMessageIds).toEqual(ids);
  }
});
test("care evaluation rejects every missing dynamic answer and never returns partial deletion", async () => {
  for (const key of ["unsolicited_paid_care_recruitment", "context_message_0", "context_message_1", "context_message_2"]) {
    const body = response(0.99, [0.1, 0.99, 0.99]);
    delete body.answers[key];
    const classifier = new JevSpamClassifier("test-only", { ...options, fetch: async () => Response.json(body) });
    await expect(evaluateCare(classifier, mixed)).rejects.toThrow("invalid " + key + " answer");
  }
});
test("care fixtures preserve historical permission and do not invent photo content", () => {
  expect(mixed[2][0]?.preview?.[0]).toMatchObject({ origin: "same_chat", sourceAuthor: "other_author" });
  expect(mixed[2][0]?.preview?.[0]?.text).toContain("Ищу оплачиваемую работу");
  expect(mixed[1].preview?.[0]).not.toHaveProperty("text");
  expect(mixed[2][1]?.text).toBe(mixed[2][0]?.text);
  expect(mixed[2][1]?.preview?.[0]?.text).not.toBe(mixed[2][0]?.preview?.[0]?.text);
});
