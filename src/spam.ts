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
  adult_profile_bait: {
    type: "noul",
    instructions:
      "Do `message` and its optional `senderProfile` form adult-content or dating profile bait, where a low-substance group message exists mainly to make readers open the sender's profile or personal channel?",
    criteria: {
      true:
        "The visible message is only an emoji, greeting, generic compliment, vague generated engagement, or another low-information hook, while senderProfile.bio or senderProfile.personalChannel advertises sexual/adult content, private videos, dating contact, registration, paid access, or an equivalent profile funnel. Count forwarded low-substance hooks when the exposed origin profile metadata contains the adult funnel.",
      false:
        "The profile metadata is benign; the message is substantive and on-topic despite the sender having an adult-oriented profile; the message reports or warns about profile spam; or no profile metadata exposes an adult/dating/private-content funnel.",
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
  unsolicited_testimonial_promotion: {
    type: "noul",
    instructions:
      "Does `message` disguise unsolicited promotion of an identifiable destination as a personal success story or helpful first-person testimonial?",
    criteria: {
      true:
        "It inserts a favorable personal experience, claimed benefit, test result, transformation, or gratitude story to endorse a named bot, channel, group, mini app, website, course, provider, or service and draw readers there. The destination may be a handle, link, embedded link, or identifiable name. Unrequested before-and-after transformation stories crediting a specifically named course and teacher are advertising testimonials even without a URL: the searchable course/provider name itself is the funnel. For example, a standalone claim that a named confidence course changed everything within a week, followed by gratitude for finding it, is promotion rather than ordinary experience reporting. Count conversational camouflage such as agreeing with life advice then crediting a named test or service for personal insight or improvement (Russian: 'попробовала', 'мне помогло', 'результат удивил'). Neither an imperative to start/join/buy nor payment, a referral code, or extravagant claims is required. Forwarded testimonials are not exempt.",
      false:
        "It answers an actual request for a recommendation, gives a substantive on-topic experience report rather than inserting a promotional success story, discusses limitations or results without funneling readers, cites a factual source, warns or asks about a service, gives official support instructions, quotes an example for moderation, or merely mentions a destination or shares a bare link. A positive opinion, first-person wording, handle, or forward alone is not proof of promotion.",
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
  unsolicited_crypto_trade_offer: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly offer to buy, sell, exchange, or provide cryptocurrency or stablecoins to group members?",
    criteria: {
      true:
        "It is a direct commercial solicitation to buy, sell, swap, cash out, or exchange USDT, Bitcoin, crypto, stablecoins, or similar assets, including terse offers such as 'will buy usdt, any amount'. Count the offer as spam even when it omits a rate, contact instruction, URL, or explicit profit claim.",
      false:
        "It continues a specifically requested or already arranged trade, discusses crypto or markets normally, describes a personal transaction without soliciting strangers, asks a genuine question, quotes an offer for moderation, or warns about crypto-trade spam or scams.",
    },
  },
  investment_testimonial_funnel: {
    type: "noul",
    instructions:
      "Does `message` use an unsolicited success testimonial about profitable investing or crypto trading to funnel readers to a trader, account manager, Telegram invite, or investment channel?",
    criteria: {
      true:
        "It praises a named trader, mentor, account manager, or investment opportunity; claims substantial profit, portfolio gains, or unusually successful results; and directs readers to Telegram links, a channel, private contact, or the promoted investment service. Count first-person gratitude stories and forwarded customer testimonials as promotion even when they avoid guarantees or direct commands.",
      false:
        "It is ordinary portfolio discussion, a requested recommendation, neutral financial news or research, a warning about investment fraud, criticism of a testimonial, or discussion that does not funnel readers to an investment provider or channel.",
    },
  },
  unsolicited_paid_work_offer: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly recruit group members for paid work, a short cash task, or an informal one-off job?",
    criteria: {
      true:
        "It offers a fixed payment for a short shift, a few hours, delivery, unloading, construction, repairs, wallpapering, errands, international parcel or shipment escorting, or another simple task; says someone is needed or asks who is available; or advertises per-task or per-route pay and expenses. Explicitly count suspicious courier recruitment that requires a passport, promises unusually high pay per flight or route, and covers tickets or expenses. Count plausible pay as spam when the offer is unsolicited, even without an explicit DM instruction or unrealistic earnings claim.",
      false:
        "It answers a request for job information or practical help, shares a verified relevant vacancy in an invited or admin-approved hiring discussion, discusses employment normally, coordinates an existing job, shipment, business trip, or shift, warns about suspicious recruitment, asks friends for help without offering pay, or is a job seeker genuinely asking for work without mass-recruiting readers.",
    },
  },
  unsolicited_vague_recruitment: {
    type: "noul",
    instructions:
      "Is the message a terse standalone paid-work recruitment post aimed at group members?",
    criteria: {
      true:
        "A short post counts one or more people as needed for a near-term task or replacement stint and states pay for that work: a sum paid at the end, pay after the job, pay starting at an amount, or a promise to pay after the work. A bare numeral joined to a completion cue such as 'upon completion' or 'after the work' is stated pay for the work, even without a currency symbol; do not reinterpret it as an invoice, a settlement, or a wage discussion. Unnamed work is normal for this pattern, so missing chore details, absent job/vacancy wording, no link, and no 'write me' call do not make it legitimate. Count today, tomorrow, and other near-term times. Forwarded copies count the same as original posts.",
      false:
        "It responds to a staffing request, publishes an invited or administrator-approved vacancy, asks friends for unpaid help, coordinates volunteers or an agreed shift, invoices or settles completed work, discusses wages, prices, or employment, asks for work as a seeker, or quotes or warns about a recruitment post. Never invent a payment term: absent any pay for future work, ordinary requests for help are not this appeal, regardless of forwarding.",
    },
  },
  one_off_cash_task_offer: {
    type: "noul",
    instructions:
      "Is `message` a terse unsolicited cash-for-task advertisement recruiting group members for a one-off physical chore?",
    criteria: {
      true:
        "It pairs a concrete chore such as wallpapering, unloading boxes, demolition, delivery, construction, moving, cleaning, or repairs with a date/duration and an explicit payment amount or payment method. Isolated group posts like 'Help wallpaper a living room, four hours, card or cash 6000', 'Tomorrow! unload boxes at a store. Who is ready, write, 4600', and 'city deliveries, 8500 per task, expenses covered' are true. Count these terse fragments as recruitment spam even if they omit the words job, vacancy, contact, or DM; forwarding does not make the offer legitimate.",
      false:
        "It continues a requested or already arranged task, asks friends for unpaid help, discusses pricing or an invoice for completed work, describes one's own ordinary workday, or posts a relevant vacancy in an invited hiring context.",
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
  unsolicited_service_referral: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly promote a paid professional, tutor, consultant, or service provider and funnel group members into private contact?",
    criteria: {
      true:
        "It gives an enthusiastic testimonial or recommendation for a tutor, teacher, coach, repairer, consultant, or other paid provider, says the provider has openings or availability, and asks interested strangers to message privately or request the contact. Count a forwarded or friend-style endorsement as promotion when the group did not ask for it.",
      false:
        "It answers an explicit request for a recommendation, shares a requested contact, discusses a provider without soliciting customers, coordinates with a provider already involved, or gives a neutral review without a private-contact funnel.",
    },
  },
  explicit_content_promotion: {
    type: "noul",
    instructions:
      "Does `message` unsolicitedly promote leaked, sexual, or explicit content, an adult channel, or registration to access such content?",
    criteria: {
      true:
        "It advertises leaks, explicit videos, incest-themed or other sensational sexual material, a private/closed adult channel, an archive, daily updates, or one-time registration to access the content. Count short teaser captions and forwarded channel promotions even when no URL or username is visible.",
      false:
        "It reports or criticizes explicit-content spam, discusses sexuality without promoting content, warns about an adult channel, quotes such wording for moderation, or refers to age restrictions without inviting access.",
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
  profile_description_sales_bait: {
    type: "noul",
    instructions:
      "Does `message` advertise a sale, product, or service and direct readers to the sender's profile, bio, or description for details or contact?",
    criteria: {
      true:
        "It announces that crypto, goods, services, prices, contact details, or an offer are available in the sender's profile or description. Treat short pitches such as 'crypto sale in the description', 'details in bio', or equivalent hidden-profile commerce as spam even without a URL.",
      false:
        "It discusses or edits a normal project or listing description, answers a request about profile information, mentions that requested contact details were added, asks where a description is, or contains no promotional call to visit the sender's profile.",
    },
  },
  multi_message_spam: {
    type: "noul",
    instructions:
      "Do `recentMessages` followed by `message` form one coordinated spam pitch split across multiple Telegram messages?",
    criteria: {
      true:
        "Together they form an unsolicited promotion, commercial offer, paid-work recruitment, gambling or bonus pitch, easy-money lure, or profile/private-message funnel even when each fragment is weak alone. A service, sale, rental, contract-transfer, job offer, or price claim followed by a short 'write in DM' call is spam. Repeated copies of the same unsolicited paid-work offer are one spam campaign. Explicitly count denials such as 'this is not advertising' when they introduce an offer, including 'I will transfer my Vancouver apartment-rental contract' followed by 'DM me', or 'first consultation is free, later ones cost 5000' followed by 'write in DM'. Other examples include 'free spins' followed by 'get free spins' and then 'details in DM', or a promotional claim followed by its link.",
      false:
        "They are independent conversation, requested help or contact, an already ongoing rental or transaction, ordinary housing discussion, ordinary short replies, a legitimate multi-message explanation, or the recent messages do not materially turn the current message into spam.",
    },
  },
} as const satisfies Record<string, NoulQuestion>;

export type SpamSignal = keyof typeof SPAM_QUESTIONS;

export type ModerationMessage = {
  text: string;
  embeddedLinks: string[];
  isForwarded: boolean;
};

export type SenderProfile = {
  bio?: string;
  personalChannel?: {
    title: string;
    description?: string;
  };
};

export type CurrentModerationMessage = ModerationMessage & {
  senderProfile?: SenderProfile;
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

  async classify(message: CurrentModerationMessage, recentMessages: ModerationMessage[] = []): Promise<SpamAssessment> {
    const fetcher = this.options.fetch ?? fetch;
    const questions: Record<string, NoulQuestion> = { ...SPAM_QUESTIONS };
    recentMessages.forEach((_recentMessage, index) => {
      questions[`context_message_${index}`] = {
        type: "noul",
        instructions: `Is \`recentMessages[${index}]\` part of the same spam pitch or campaign as \`message\`?`,
        criteria: {
          true:
            "It is a fragment, setup, repeated line, call to action, link, or continuation of the spam pitch expressed by the current message and its context. Link an unsolicited sale, service, rental, contract-transfer, paid-work recruitment, price, bonus, or earnings claim to its later short profile/private-message call, even when the earlier fragment denies being advertising. Link repeated copies of the same unsolicited offer.",
          false:
            "It is unrelated legitimate conversation, requested help or contact, an already ongoing transaction, incidental context, or does not belong to the spam pitch containing the current message.",
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
