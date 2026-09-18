const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

export const SPAM_QUESTIONS = {
  unsolicited_promotion: {
    type: "noul",
    instructions:
      "Is `message` unsolicited promotional spam that a reasonable Telegram group moderator should delete?",
    criteria: {
      true:
        "It shills a token, investment, gambling product, adult service, paid service, referral, giveaway, airdrop, get-rich scheme, or unrelated commercial link without being invited by the conversation.",
      false:
        "It is normal conversation, a relevant link, a requested recommendation, a genuine project discussion, or non-promotional content.",
    },
  },
  profile_bait: {
    type: "noul",
    instructions:
      "Is `message` spam that tries to funnel readers to the sender's bio, profile, private messages, channel, or hidden link?",
    criteria: {
      true:
        "It uses bait such as 'check my bio', 'link in profile', 'DM me', or an equivalent call to leave the group, especially with money, dating, investment, or giveaway claims.",
      false:
        "It mentions a profile, bio, private message, or channel for a legitimate conversational reason and is not an unsolicited funnel.",
    },
  },
  scam_or_phishing: {
    type: "noul",
    instructions:
      "Is `message` a scam, phishing attempt, wallet-drainer lure, fake support message, impersonation, or fraudulent giveaway?",
    criteria: {
      true:
        "It tries to steal credentials or funds, requests a seed phrase or private key, impersonates staff, offers a fake prize or airdrop, or directs readers to a suspicious claim/connect/verify page.",
      false:
        "It is ordinary conversation and does not deceptively seek credentials, money, wallet access, or trust.",
    },
  },
  disruptive_spam: {
    type: "noul",
    instructions:
      "Is `message` obvious disruptive Telegram spam that contributes no legitimate value to the group?",
    criteria: {
      true:
        "It is irrelevant copy-paste outreach, mass mentions, repetitive junk, engagement bait, unsolicited recruitment, or another recognizable spam pattern.",
      false:
        "It is a plausible human contribution, question, joke, greeting, disagreement, or on-topic message, even if short or informal.",
    },
  },
} as const;

export type SpamSignal = keyof typeof SPAM_QUESTIONS;

export type ModerationMessage = {
  text: string;
  embeddedLinks: string[];
  isForwarded: boolean;
};

export type SpamAssessment = {
  shouldDelete: boolean;
  strongestSignal: SpamSignal;
  probability: number;
  signals: Record<SpamSignal, number>;
  model: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class JevSpamClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly options: {
      model: string;
      threshold: number;
      timeoutMs: number;
      fetch?: FetchLike;
    },
  ) {}

  async classify(message: ModerationMessage): Promise<SpamAssessment> {
    const fetcher = this.options.fetch ?? fetch;
    const response = await fetcher(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        state: { message },
        questions: SPAM_QUESTIONS,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`TypeSafe request failed with HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    return parseAssessment(body, this.options.threshold);
  }
}

export function parseAssessment(body: unknown, threshold: number): SpamAssessment {
  if (!isRecord(body) || typeof body.model !== "string") {
    throw new Error("TypeSafe returned an invalid response");
  }
  const answers = body.answers;
  if (!isRecord(answers)) throw new Error("TypeSafe returned an invalid response");

  const entries = (Object.keys(SPAM_QUESTIONS) as SpamSignal[]).map((signal) => {
    const answer = answers[signal];
    if (!isRecord(answer) || answer.type !== "noul" || !isProbability(answer.noul)) {
      throw new Error(`TypeSafe returned an invalid ${signal} answer`);
    }
    return [signal, answer.noul] as const;
  });

  const signals = Object.fromEntries(entries) as Record<SpamSignal, number>;
  const [strongestSignal, probability] = entries.reduce((strongest, current) =>
    current[1] > strongest[1] ? current : strongest,
  );

  return {
    shouldDelete: probability >= threshold,
    strongestSignal,
    probability,
    signals,
    model: body.model,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
