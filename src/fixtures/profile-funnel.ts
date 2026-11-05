import type { SenderProfile } from "../spam";
import type { PersonalChannelPost } from "../personal-posts";

// #470. Teaser texts, titles and comments are the captured campaign's own words
// (Golden Borodutch Chat and two trading chats, Oct 25 – Nov 5); every invite hash,
// channel handle and post ID below is SYNTHETIC.
const post = (id: number, text: string, embeddedLinks: string[] = []): PersonalChannelPost =>
  ({ url: "https://t.me/synthetic_channel/" + id, text, embeddedLinks });
const created = post(1, "Channel created");
const channel = (title: string, posts: PersonalChannelPost[], description?: string): SenderProfile =>
  ({ personalChannel: { title, ...(description ? { description } : {}), posts } });

export const funnelIncident = {
  text: "What's the stack you're using for this?",
  profile: channel("Shorts stayed. Top didn't 💪", [
    post(3, "She walked in and the top came off in the hallway 😳 Next frame is locked. https://t.me/+SyntheticInvite01", ["https://t.me/+SyntheticInvite01"]),
    created,
  ], "Home from the gym. Half the outfit made it 🔒"),
};

// Each funnel profile with one of the comments its account posted.
export const funnelProfiles: { id: string; text: string; profile: SenderProfile }[] = [
  { id: "incident", ...funnelIncident },
  { id: "come-in", text: "Staying calm is actually kind of hot 😌",
    profile: channel("Private View 😈", [post(3, "Clothes are optional in here 😉 Curious? Come in 👀 https://t.me/+SyntheticInvite02", ["https://t.me/+SyntheticInvite02"]), created]) },
  { id: "repeated-link", text: "sounds fun but how do I pick a side?",
    profile: channel("🌙 You Found Me", [post(3, "My camera roll is a dangerous place... 😈👇 https://t.me/+SyntheticInvite03 https://t.me/+SyntheticInvite03", ["https://t.me/+SyntheticInvite03"]), created],
      "👀 Curiosity brought you here... don't disappoint yourself") },
  // The link sits behind the post's words ("main channel"), so only embeddedLinks carry it.
  { id: "hyperlinked", text: "Does the current bearish momentum align with any upcoming fundamental news or economic data releases?",
    profile: channel("vip sl*t room 🔞", [post(3, "I'm getting naked on my main channel right now, don't miss it", ["https://t.me/+SyntheticInvite04"]), created]) },
  // A finance-themed cover is the same funnel.
  { id: "finance-cover", text: "Wait for the candle close before entering this short",
    profile: channel("Isabella's numbers", [post(4, "We show you seductive economics 😉 https://t.me/+SyntheticInvite05", ["https://t.me/+SyntheticInvite05"]), created]) },
  // Mathematical bold letters are still words.
  { id: "math-bold", text: "Expected, but still boring.",
    profile: channel("Mei World", [post(3, "𝙒𝙖𝙣𝙩 𝙢𝙤𝙧𝙚 𝙤𝙛 𝙢𝙚 𝙞𝙣 𝙮𝙤𝙪𝙧 𝙡𝙞𝙛𝙚? 𝙔𝙤𝙪 𝙠𝙣𝙤𝙬 𝙬𝙝𝙚𝙧𝙚 𝙩𝙤 𝙛𝙞𝙣𝙙 𝙢𝙚. https://t.me/+SyntheticInvite06", ["https://t.me/+SyntheticInvite06"]), created]) },
  // Creation scrolled out of the two fetched posts; a later service event remains.
  { id: "photo-updated", text: "3895 holding or breaking, that support gonna decide the mood today",
    profile: channel("Kiss This After Dark 💋", [post(3, "Come closer, little trouble 😈👇 https://t.me/+SyntheticInvite07", ["https://t.me/+SyntheticInvite07"]), post(2, "Channel photo updated")]) },
  { id: "renamed", text: "I'm definitely team bull 😈",
    profile: channel("Strip Me Here 😈", [post(4, "Channel name was changed to «Strip Me Here 😈»"), post(3, "I’m already naked… want to see? 🍑👇 https://t.me/+SyntheticInvite08", ["https://t.me/+SyntheticInvite08"])]) },
  // Only the teaser post is public (other posts were forwards or deleted).
  { id: "lone-post", text: "This volatility is driving me crazy 😵‍💫",
    profile: channel("Warrior Mia ⚔️", [post(3, "The armor hides almost nothing. The skirt hides even less 🙈 The rest is here 👉 https://t.me/+SyntheticInvite09", ["https://t.me/+SyntheticInvite09"])]) },
  // Legacy invite form, scheme-less text link, telegram.me host and an emoji glued to the link.
  { id: "joinchat", text: "RSI overbought is a clear signal for a correction",
    profile: channel("Bobby economist here", [post(3, "I reveal hot market moves here 🗞🔥 https://t.me/joinchat/SyntheticInvite10", ["https://t.me/joinchat/SyntheticInvite10"]), created]) },
  { id: "bare-host", text: "finally someone explaining this in a way i actually get 😏",
    profile: channel("Freya Cole | cat left, i stayed", [post(3, "cat was covering me on purpose. hes gone in this one t.me/+SyntheticInvite11"), created]) },
  { id: "glued-emoji", text: "Paper trading is a good way to test strategies without any risk.",
    profile: channel("Off Duty 🔥", [post(3, "Off duty, shirt off 😳 Home set is locked http://telegram.me/+SyntheticInvite12👇", ["http://telegram.me/+SyntheticInvite12👇"]), created]) },
  // A commercial offer: the invite plus the offer's own site (bare domain in the text, linked once).
  { id: "diploma-site", text: "Интересный исторический факт.",
    profile: channel("Высшее и среднее образование 1-3 мес.", [post(3, "Помогаем получить Официально Высшее и Среднее образование всего за 1-3 месяца! 🎓 Помощь при поступлении и сдаче сессий! Переводы, Заверение, Апостиль и Легализация документов. 📘 Подписывайся! ⬇️ ПOДПИШИCЬ HA КАНAЛ ⬇️ 👉 https://t.me/+SyntheticInvite13 👉 https://t.me/+SyntheticInvite13 ⬇️ Официальный сайт ⬇️ Synthetic-Diplomas.example",
      ["https://t.me/+SyntheticInvite13", "http://Synthetic-Diplomas.example/"]), post(2, "Channel photo updated")]) },
];

// Profiles the rule must leave alone: the captured benign shapes, synthetic handles and hashes.
export const ordinaryProfiles: { id: string; text: string; profile: SenderProfile | undefined }[] = [
  { id: "no-profile", text: "What's the stack you're using for this?", profile: undefined },
  { id: "bio-invite", text: "What's the stack you're using for this?", profile: { bio: "Join my study group 👇 https://t.me/+SyntheticInvite20" } },
  { id: "channel-without-posts", text: "What's the stack you're using for this?",
    profile: { bio: "Backend dev", personalChannel: { title: "Shorts stayed. Top didn't 💪", description: "Home from the gym. Half the outfit made it 🔒" } } },
  // An owner's channel that is only a pointer: a bare link, or a one-word label.
  { id: "bare-link", text: "Assalam alaykum! Vazifalar faqat shular bo'ladimi?",
    profile: channel("Ozodbek`s channels", [post(13, "https://t.me/+SyntheticInvite21", ["https://t.me/+SyntheticInvite21"]), created]) },
  { id: "one-word", text: "buy vesc", profile: channel("Gateaway", [post(2, "main", ["https://t.me/+SyntheticInvite22"]), created]) },
  { id: "two-words", text: "Nice", profile: channel("🩰✨", [post(3, "Asosiy kanal:👇🏻 https://t.me/+SyntheticInvite23", ["https://t.me/+SyntheticInvite23"]), created]) },
  // Hubs and storefronts list several destinations or a contact handle.
  { id: "bio-card", text: "Всем привет как вам моя шляпа только что купил?",
    profile: channel("Twilight |BIO", [post(5, "🌐Welcome To My Bio🌐 ✅Nickname: Twilight 🖥 Channel: click 🧑‍💻My projects: click", ["https://t.me/synthetic_owner", "https://t.me/+SyntheticInvite24", "https://t.me/synthetic_projects"]), created]) },
  { id: "artist-hub", text: "Love this palette",
    profile: channel("Fox Hub", [post(3, "Hello! I'm Fox, a self-taught digital artist. Drawing channel • Personal channel", ["https://t.me/synthetic_art", "https://t.me/+SyntheticInvite25"]), created], "Channel to hop around my channels") },
  { id: "store-contact", text: "Why so high? 75$",
    profile: channel("Synthetic Portal", [post(2, "Welcome to my portal ↗️ 🛍️Channel - https://t.me/+SyntheticInvite26 ✅Vouches - dm ✈️Contact - @synthetic_owner", ["https://t.me/+SyntheticInvite26", "https://t.me/synthetic_owner"]), created]) },
  { id: "store-handle-link", text: "Wtf",
    profile: channel("WAY TO SYNTHETIC", [post(2, "MAIN STORE LINK BELOW 😊 https://t.me/+SyntheticInvite27", ["https://t.me/+SyntheticInvite27", "https://t.me/synthetic_store"]), created]) },
  { id: "invite-and-two-sites", text: "Love this palette",
    profile: channel("Fox", [post(3, "Portfolio, shop and my private sketch channel", ["https://synthetic.example/", "https://shop.synthetic.example/", "https://t.me/+SyntheticInvite28"]), created]) },
  { id: "hub-with-site", text: "Nice",
    profile: channel("Links", [post(3, "My blog, my channel and the private chat", ["https://synthetic.example/blog", "https://t.me/synthetic_owner_channel", "https://t.me/+SyntheticInvite32"]), created]) },
  // A public channel link names its destination; only a private invite hides it.
  { id: "public-channel", text: "What's the stack you're using for this?",
    profile: channel("Dev notes", [post(3, "My notes on building trading bots live here https://t.me/synthetic_devnotes", ["https://t.me/synthetic_devnotes"]), created]) },
  { id: "site", text: "What's the stack you're using for this?",
    profile: channel("Dev notes", [post(3, "I write about Rust and Postgres on my blog https://synthetic.example/blog", ["https://synthetic.example/blog"]), created]) },
  // A channel with history: two content posts, or one post far past its creation.
  { id: "two-posts", text: "😊",
    profile: channel("🪷", [post(11, "https://t.me/+SyntheticInvite29 My private channel 💗", ["https://t.me/+SyntheticInvite29"]), post(3, "#Bismillah")]) },
  { id: "community", text: "Listening reading",
    profile: channel("English Bloom", [post(10, "https://t.me/+SyntheticInvite30", ["https://t.me/+SyntheticInvite30"]), post(7, "Join our English community!")]) },
  { id: "old-channel", text: "What's the stack you're using for this?",
    profile: channel("Study abroad", [post(42, "Grants and scholarships are announced first in our main channel, join here https://t.me/+SyntheticInvite31", ["https://t.me/+SyntheticInvite31"]), post(41, "Channel photo updated")]) },
  { id: "service-only", text: "hi", profile: channel("Fresh", [post(2, "Channel photo updated"), created]) },
];
