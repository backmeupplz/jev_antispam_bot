const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const CONTEXT_LINK_THRESHOLD = 0.75;

type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
};

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
  bot_promotion: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly advertise or invite group members to use another Telegram bot, game bot, channel, or mini app?",
    criteria: {
      true:
        "It recommends, invites, or tells readers to play, open, start, or use an @...Bot, channel, mini app, or Telegram game, including short pitches such as offering a cool game.",
      false:
        "It asks a genuine question about a bot, answers a request, warns about a bot, or mentions one without promoting or inviting use.",
    },
  },
  adult_dm_bait: {
    type: "noul",
    instructions:
      "Does `message` solicit sexual content, dating contact, or private messages from group members?",
    criteria: {
      true:
        "It offers or requests nudes or sexual content, or asks strangers to write in DMs or private chat for sexual or dating reasons, including short slang such as 'nudes in DMs'.",
      false:
        "It discusses sexuality or private messages without soliciting contact or content.",
    },
  },
  gambling_promotion: {
    type: "noul",
    instructions:
      "Does `message` advertise or lure readers to a casino, betting, or gambling website?",
    criteria: {
      true:
        "It praises, recommends, links, or directs readers to an online casino, betting site, gambling bonuses, or gambling offer, including when disguised as a joke, pets, games, or an unrelated personal recommendation.",
      false:
        "It neutrally discusses gambling, asks about addiction or regulation, reports news, or warns against a gambling site without promoting it.",
    },
  },
  easy_money_bait: {
    type: "noul",
    instructions:
      "Does `message` use an unsolicited easy-money or implausible earnings claim as click bait?",
    criteria: {
      true:
        "It promises or advertises unusually easy, guaranteed, extreme, daily, or unrealistic earnings, especially alongside a URL, profile invitation, or private-message funnel.",
      false:
        "It discusses ordinary salary, business revenue, economics, or income without using an earnings promise as a lure.",
    },
  },
  standalone_link_promotion: {
    type: "noul",
    instructions:
      "Is `message` a standalone unsolicited promotional pitch for an external website?",
    criteria: {
      true:
        "It contains a URL plus praise, a personal endorsement, a favorite-site claim, a best-site claim, an invitation, or another reason to visit, and the message itself gives no sign that the group requested it. A bare message in the form 'best site for X - URL' is promotional. Count playful cover stories about cats, turtles, pets, or unrelated subjects when they funnel readers to the URL.",
      false:
        "It explicitly answers a request, supplies a contextually relevant citation or documentation link, shares news/source material in an ongoing discussion, asks a genuine question, warns about the site, or otherwise uses the URL as useful context rather than promoting a visit.",
    },
  },
  direct_contact_solicitation: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly advertise a product or service and direct group members to contact the sender privately?",
    criteria: {
      true:
        "It offers account recovery, consulting, help, products, treatments, sales, or another commercial service to the group and asks readers to write, DM, email, call, or otherwise contact the advertiser directly. Count a product or service pitch followed by an email address, phone number, username, or private-contact instruction as the call to action even when it does not explicitly say 'contact me'.",
      false:
        "It answers a request for help or a recommendation, shares contact details requested in the conversation, coordinates privately with someone already engaged, points to official support, or mentions a product or service without unsolicitedly soliciting customers or private contact.",
    },
  },
  direct_response_advertising: {
    type: "noul",
    instructions:
      "Is `message` an unsolicited direct-response advertisement where a product or service claim is paired with contact details as the way to respond?",
    criteria: {
      true:
        "A product, treatment, service, or commercial offer is presented and an email address, phone number, username, or other contact is appended so readers can inquire or buy. Treat a message like 'hair-loss shampoos from the patent author' followed by an email address as advertising spam even without an explicit 'contact me' phrase.",
      false:
        "The contact was requested, belongs to official support, is an author citation, is ordinary coordination, or the message asks for product reviews without offering anything.",
    },
  },
  multi_message_spam: {
    type: "noul",
    instructions:
      "Do `recentMessages` followed by `message` form one coordinated spam pitch split across multiple Telegram messages?",
    criteria: {
      true:
        "Together they form a recognizable unsolicited promotion, gambling or bonus pitch, easy-money lure, profile/private-message funnel, or repeated spam burst even when each individual fragment looks harmless. Examples include 'free spins' followed by 'get free spins' and then 'details in DM', or a promotional claim followed by its link in another message.",
      false:
        "They are independent conversational messages, ordinary short replies, a legitimate multi-message explanation, or the recent messages do not materially turn the current message into spam.",
    },
  },
} as const satisfies Record<string, NoulQuestion>;

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
  contextProbabilities: number[];
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

  async classify(message: ModerationMessage, recentMessages: ModerationMessage[] = []): Promise<SpamAssessment> {
    const fetcher = this.options.fetch ?? fetch;
    const questions: Record<string, NoulQuestion> = { ...SPAM_QUESTIONS };
    recentMessages.forEach((_recentMessage, index) => {
      questions[`context_message_${index}`] = {
        type: "noul",
        instructions: `Is \`recentMessages[${index}]\` part of the same spam pitch or campaign as \`message\`?`,
        criteria: {
          true:
            "It is a fragment, setup, repeated line, call to action, link, or continuation of the spam pitch expressed by the current message and its context.",
          false:
            "It is unrelated legitimate conversation, incidental context, or does not belong to the spam pitch containing the current message.",
        },
      };
    });
    const response = await fetcher(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        state: { message, recentMessages },
        questions,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`TypeSafe request failed with HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    return parseAssessment(body, this.options.threshold, recentMessages.length);
  }
}

export function parseAssessment(body: unknown, threshold: number, contextCount = 0): SpamAssessment {
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
  const contextProbabilities = Array.from({ length: contextCount }, (_value, index) => {
    const answer = answers[`context_message_${index}`];
    if (!isRecord(answer) || answer.type !== "noul" || !isProbability(answer.noul)) {
      throw new Error(`TypeSafe returned an invalid context_message_${index} answer`);
    }
    return answer.noul;
  });
  const [strongestSignal, probability] = entries.reduce((strongest, current) =>
    current[1] > strongest[1] ? current : strongest,
  );

  return {
    shouldDelete: probability >= threshold,
    strongestSignal,
    probability,
    signals,
    contextProbabilities,
    model: body.model,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
