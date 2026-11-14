// #668: the guest-bot reply a hijacked member's bot summon brings in (Nikita's screenshot, Nov 14), as text. Its "Нажмите на этот
// текст" is almost certainly a hidden link to the bot's ?start=; the handle below is the one the summon named.
export const chatMovedIncident =
  "‼️ Чат переносится в новую группу. Нажмите на этот текст, чтобы перейти в группу 💬 Затем нажмите кнопку «Начать», чтобы присоединиться к группе";
export const chatMovedLink = "https://t.me/TURAN732_BOT?start=join";
// The summon that called the bot: one bot handle from a member.
export const guestSummon = "@TURAN732_BOT";
// Scores on the deployed Laya (laya-jev-ckpt-v2, gate 0.80) before #668, from the ticket's replay: plain text and with the hidden link.
export const chatMovedScores = { plain: 0.6825, hiddenLink: 0.8142, summon: 0.9355 };

// SYNTHETIC variants of the same lure, RU and EN: the chat or group moves, and the reader taps this text, presses Start, or opens a
// bot's ?start= link.
export const chatMovedFamily = [
  chatMovedIncident,
  "‼️ Группа переехала в новый чат. Нажмите на этот текст, чтобы перейти 👉 затем нажмите Start",
  "Внимание! Чат переносится в новую группу, жмите сюда и нажмите «Старт»",
  "Мы переезжаем в новую группу! Нажмите кнопку Начать, чтобы присоединиться",
  "Группа переехала в новый чат, нажмите Start, чтобы попасть туда",
  "Чат переехал: t.me/newchat_join_bot?start=group",
  "Переезд в новый чат. Нажмите на это сообщение и затем «Начать»",
  "‼️ The chat is moving to a new group. Tap this text to go there, then press Start to join",
  "Our group has moved to a new chat! Hit the Start button to join",
  "We're moving to a new group, tap on this message then press \"Start\"",
  "The group moved: https://t.me/newgroup_helper_bot?start=join",
];
// A bot start link hidden behind the text or on a button: the same lure with no visible call.
export const chatMovedHidden = { text: "‼️ Чат переносится в новую группу 💬", link: "https://t.me/TURAN732_BOT?start=join" };

// Kept: a member telling where the chat went, a bot's own help, a warning quoting the lure, and ordinary chat.
export const chatMovedControls = [
  "we moved to @newchat",
  "Мы переехали в новый чат @newchat, кто не успел — заходите",
  "группа переехала, ссылка в описании",
  "Чат переносится на завтра, созвон в 19:00",
  "Нажмите /start, чтобы начать работу с ботом",
  "Press Start to begin. Use /help to see all commands",
  "Чтобы бот заработал, нажмите кнопку «Начать» в личке",
  "Осторожно, спам: «Чат переносится в новую группу. Нажмите на этот текст»",
  "Опять бот пишет что чат переносится и надо нажать начать, это скам",
  "Ребята, кто идёт сегодня на встречу? Я буду к семи",
  "Подскажите, как перенести чат в другую группу в телеграме?",
  "Чат перенесли на завтра, нажмите тут чтобы посмотреть расписание",
  "The chat moved on to football, click here for the match thread",
  // Astra r1: a victim asking about the lure or passing it on, speed, a gaming server, a meetup, Discord, YouTube, "forward this".
  "Бот пишет что чат переносится в новую группу и нажмите на этот текст, это правда?",
  "Мне пришло что чат переносится в новую группу, нажмите кнопку Начать. Кто-то знает что это?",
  "Мне пришло: чат переносится в новую группу, нажмите кнопку Начать",
  "chat is moving so fast lol, click here to see the pinned message",
  "The group moved the meetup to Friday. Tap here for the map",
  "Группа переехала на другой сервер, жми старт и заходи",
  "Перешли в другой чат и нажми сюда",
  "our community moved to discord, click here",
  "the channel moved to youtube. hit start on the video",
  "Группа переехала, нажмите Start, чтобы попасть в новый чат",
  "Мы переехали в новую группу, нажмите сюда",
  // Astra r2: people moving (not the chat) next to a bot link, and members re-typing the lure to warn others.
  "Информация о переезде есть в боте t.me/expat_faq_bot?start=faq",
  "Переезд в Сербию: все документы через бота t.me/serbia_docs_bot?start=chat",
  "Мы переезжаем в Грузию на следующей неделе, бот с вакансиями t.me/geo_jobs_bot?start=1",
  "We're moving to Lisbon next month, this bot helped a lot t.me/nomad_helper_bot?start=ref",
  "Опять этот бот: Чат переносится в новую группу. Нажмите на этот текст, затем нажмите кнопку Начать",
  "У Карины угнали аккаунт, теперь там бот: чат переносится в новую группу, нажмите на этот текст",
  "lol this bot again: the chat is moving to a new group, tap this text",
];

// Controls the model deletes on its own (no rule) on the deployed Laya: a bot's "press Start in private" (0.87), a community
// that moved to Discord with "click here" (0.84), a documents bot for moving to Serbia (0.88) and a re-typed lure after "угнали
// аккаунт" (0.88). They are pattern controls only; the live test skips them.
export const chatMovedModelOnly = [
  "Чтобы бот заработал, нажмите кнопку «Начать» в личке",
  "our community moved to discord, click here",
  "Переезд в Сербию: все документы через бота t.me/serbia_docs_bot?start=chat",
  "У Карины угнали аккаунт, теперь там бот: чат переносится в новую группу, нажмите на этот текст",
];
