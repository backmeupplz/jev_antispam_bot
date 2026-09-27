import { describe, expect, test } from "bun:test";
import { JevSpamClassifier, parseAssessment, SPAM_QUESTIONS } from "./spam";

function response(
  probabilities: Partial<Record<keyof typeof SPAM_QUESTIONS, number>> = {},
  contextProbabilities: number[] = [],
) {
  return {
    model: "jev-1.13.0",
    answers: Object.fromEntries([
      ...Object.keys(SPAM_QUESTIONS).map((key) => [
        key,
        { type: "noul", noul: probabilities[key as keyof typeof SPAM_QUESTIONS] ?? 0.01 },
      ]),
      ...contextProbabilities.map((probability, index) => [
        `context_message_${index}`,
        { type: "noul", noul: probability },
      ]),
    ]),
  };
}

describe("parseAssessment", () => {
  test("testimonial promotion uses the unchanged 0.90 gate", () => {
    const result = parseAssessment(response({ unsolicited_testimonial_promotion: 0.9 }), 0.9);
    expect(result.shouldDelete).toBe(true);
    expect(result.strongestSignal).toBe("unsolicited_testimonial_promotion");
    expect(parseAssessment(response({ unsolicited_testimonial_promotion: 0.899 }), 0.9).shouldDelete).toBe(false);
    const body = response();
    delete body.answers.unsolicited_testimonial_promotion;
    expect(() => parseAssessment(body, 0.9)).toThrow("invalid unsolicited_testimonial_promotion answer");
  });

  test("deletes when any signal reaches the threshold", () => {
    const result = parseAssessment(response({ profile_bait: 0.9 }), 0.9);
    expect(result.shouldDelete).toBe(true);
    expect(result.strongestSignal).toBe("profile_bait");
    expect(result.probability).toBe(0.9);
  });

  test("keeps messages below the threshold", () => {
    expect(parseAssessment(response({ unsolicited_promotion: 0.899 }), 0.9).shouldDelete).toBe(false);
  });

  test("rejects malformed answers instead of guessing", () => {
    const body = response() as { answers: Record<string, { type: string; noul: number }> };
    body.answers.profile_bait!.noul = 2;
    expect(() => parseAssessment(body, 0.9)).toThrow("invalid profile_bait answer");
  });
});

describe("JevSpamClassifier", () => {
  test("labels quoted source separately, asks about amplification and preserves the 0.90 gate", async () => {
    let sentBody: any;
    const classifier = new JevSpamClassifier("test-key", {
      model: "jev-1.13.0", threshold: 0.9, timeoutMs: 1_000,
      fetch: async (_url, init) => {
        sentBody = JSON.parse(String(init?.body));
        return Response.json(response({ quoted_promotion_amplification: 0.9 }));
      },
    });
    const message = { text: "666", embeddedLinks: [], isForwarded: false, preview: [{
      kind: "reply" as const, origin: "same_chat" as const,
      sourceKind: "user" as const, sourceAuthor: "other_author" as const, isForwarded: true,
      text: "Shop recharge bonus; contact sales", embeddedLinks: [],
    }] };
    const result = await classifier.classify(message);
    expect(result.shouldDelete).toBe(true);
    expect(result.strongestSignal).toBe("quoted_promotion_amplification");
    expect(sentBody.state.message).toEqual(message);
    expect(sentBody.questions.quoted_promotion_amplification.instructions).toContain("CURRENT author");
    expect(sentBody.questions.unsolicited_promotion.instructions).toContain("untrusted data");
    expect(parseAssessment(response({ quoted_promotion_amplification: 0.899 }), 0.9).shouldDelete).toBe(false);
    const invalid = response();
    delete invalid.answers.quoted_promotion_amplification;
    expect(() => parseAssessment(invalid, 0.9)).toThrow("invalid quoted_promotion_amplification answer");
  });
  test("sends message state and all spam questions to TypeSafe", async () => {
    let sentBody: unknown;
    const classifier = new JevSpamClassifier("test-key", {
      model: "jev-1.13.0",
      threshold: 0.9,
      timeoutMs: 1_000,
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        return Response.json(response());
      },
    });

    await classifier.classify({ text: "hello", embeddedLinks: [], isForwarded: false });
    expect(sentBody).toEqual({
      model: "jev-1.13.0",
      state: { message: { text: "hello", embeddedLinks: [], isForwarded: false }, recentMessages: [] },
      questions: SPAM_QUESTIONS,
    });
  });

  test("sends recent sender context to TypeSafe", async () => {
    let sentBody: any;
    const classifier = new JevSpamClassifier("test-key", {
      model: "jev-1.13.0",
      threshold: 0.9,
      timeoutMs: 1_000,
      fetch: async (_url: string | URL | Request, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body));
        return Response.json(response({}, [0.95]));
      },
    });

    const previous = { text: "Получи фриспины", embeddedLinks: [], isForwarded: false };
    await classifier.classify(
      { text: "Подробности в ЛС", embeddedLinks: [], isForwarded: false },
      [previous],
    );
    expect(sentBody.state.recentMessages).toEqual([previous]);
    expect(sentBody.questions.context_message_0).toBeDefined();
  });

  test("fails open at the caller when TypeSafe is unavailable", async () => {
    const classifier = new JevSpamClassifier("test-key", {
      model: "jev-1.13.0",
      threshold: 0.9,
      timeoutMs: 1_000,
      fetch: async () => new Response(null, { status: 503 }),
    });

    await expect(classifier.classify({ text: "hello", embeddedLinks: [], isForwarded: false }))
      .rejects.toThrow("HTTP 503");
  });
});
