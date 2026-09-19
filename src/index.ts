import { Bot, GrammyError, HttpError } from "grammy";
import { AdminCache } from "./admin-cache";
import { loadConfig } from "./config";
import { deleteMessages } from "./deletion";
import { deletionMessageIds, MessageHistory } from "./history";
import { toModerationMessage } from "./message";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier, type SpamAssessment } from "./spam";
import { createStatsRecorder } from "./stats";

const config = loadConfig();
const bot = new Bot(config.telegramBotToken);
const admins = new AdminCache();
const history = new MessageHistory();
const stats = createStatsRecorder(config.databaseUrl);
const classifier = new JevSpamClassifier(config.typesafeApiKey, {
  model: config.jevModel,
  threshold: config.spamThreshold,
  timeoutMs: config.jevTimeoutMs,
});

bot.use(async (ctx, next) => {
  if (ctx.chat) stats.observeChat({ chatId: ctx.chat.id, chatType: ctx.chat.type });
  await next();
});

bot.on(
  ["message:text", "message:caption", "edited_message:text", "edited_message:caption"],
  async (ctx, next) => {
    if (ctx.chat.type === "private" || !ctx.from || ctx.senderChat || ctx.from.id === bot.botInfo.id) {
      await next();
      return;
    }

    const message = toModerationMessage(ctx.msg);
    if (!message) {
      await next();
      return;
    }

    try {
      if (await admins.isAdmin(ctx.api, ctx.chat.id, ctx.from.id)) {
        await next();
        return;
      }
    } catch (error) {
      logFailure("admin_check_failed", error, ctx.chat.id, ctx.msgId);
      await next();
      return;
    }

    const analysisStartedAt = performance.now();
    const recentMessages = history.recent(ctx.chat.id, ctx.from.id, Date.now(), ctx.msgId);
    console.info(JSON.stringify({
      event: "message_analysis_started",
      chatId: ctx.chat.id,
      messageId: ctx.msgId,
      characterCount: message.text.length,
      embeddedLinkCount: message.embeddedLinks.length,
      isForwarded: message.isForwarded,
      isEdited: "edited_message" in ctx.update,
      contextMessageCount: recentMessages.length,
    }));

    let assessment;
    try {
      assessment = await classifier.classify(
        message,
        recentMessages.map(({ text, embeddedLinks, isForwarded }) => ({ text, embeddedLinks, isForwarded })),
      );
    } catch (error) {
      history.remember(ctx.chat.id, ctx.from.id, { ...message, messageId: ctx.msgId, receivedAt: Date.now() });
      logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, undefined, recentMessages.length);
      logFailure("classification_failed", error, ctx.chat.id, ctx.msgId);
      await next();
      return;
    }

    logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, assessment, recentMessages.length);

    if (!assessment.shouldDelete) {
      history.remember(ctx.chat.id, ctx.from.id, { ...message, messageId: ctx.msgId, receivedAt: Date.now() });
      await next();
      return;
    }

    const messageIds = deletionMessageIds(
      recentMessages,
      ctx.msgId,
      assessment.contextProbabilities,
      CONTEXT_LINK_THRESHOLD,
    );
    if (messageIds.length > 1) history.clear(ctx.chat.id, ctx.from.id);

    const deletedMessageCount = await deleteMessages(
      ctx.chat.id,
      messageIds,
      (chatId, messageId) => ctx.api.deleteMessage(chatId, messageId),
      (chatId, messageId) => stats.recordDeletion({ chatId, messageId }),
      (error, messageId) => logFailure("delete_failed", error, ctx.chat.id, messageId),
    );

    if (deletedMessageCount) {
      console.info(JSON.stringify({
        event: "spam_deleted",
        chatId: ctx.chat.id,
        messageId: ctx.msgId,
        deletedMessageCount,
        attemptedMessageCount: messageIds.length,
        signal: assessment.strongestSignal,
        probability: assessment.probability,
        model: assessment.model,
      }));
    }
  },
);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "I delete high-confidence Telegram spam using Jev. Add me to a group as an administrator with permission to delete messages.",
  );
});

bot.command("status", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("Online. Add me to a group as an administrator with permission to delete messages.");
    return;
  }

  const me = await ctx.api.getChatMember(ctx.chat.id, bot.botInfo.id);
  const canDelete = me.status === "administrator" && me.can_delete_messages;
  await ctx.reply(canDelete ? "Active: I can analyze and delete spam here." : "Not active: grant me administrator permission to delete messages.");
});

bot.on("my_chat_member", async (ctx) => {
  const member = ctx.myChatMember.new_chat_member;
  stats.observeChat({
    chatId: ctx.chat.id,
    chatType: ctx.chat.type,
    membershipActive: member.status !== "left" && member.status !== "kicked",
  });
  if (member.status === "left" || member.status === "kicked") return;

  const canDelete = member.status === "administrator" && member.can_delete_messages;
  await ctx.reply(
    canDelete
      ? "Jev Anti-Spam is active. I will delete only high-confidence spam."
      : "Grant me administrator permission to delete messages, then run /status.",
  );
});

bot.on("chat_member", async (ctx) => {
  admins.invalidate(ctx.chat.id, ctx.chatMember.new_chat_member.user.id);
});

bot.catch(({ error, ctx }) => {
  logFailure("update_failed", error, ctx.chat?.id, ctx.msgId);
});

function logFailure(event: string, error: unknown, chatId?: number, messageId?: number): void {
  const kind = error instanceof GrammyError
    ? `telegram_${error.error_code}`
    : error instanceof HttpError
      ? "telegram_network"
      : error instanceof Error
        ? error.name
        : "unknown";
  console.error(JSON.stringify({ event, kind, chatId, messageId }));
}

function logAnalysisResult(
  chatId: number,
  messageId: number,
  startedAt: number,
  assessment?: SpamAssessment,
  contextMessageCount = 0,
): void {
  console.info(JSON.stringify({
    event: "message_analyzed",
    status: assessment ? "completed" : "failed",
    chatId,
    messageId,
    decision: assessment?.shouldDelete ? "delete" : "keep",
    confidence: assessment?.probability ?? null,
    strongestSignal: assessment?.strongestSignal ?? null,
    signals: assessment?.signals ?? null,
    contextProbabilities: assessment?.contextProbabilities ?? null,
    model: assessment?.model ?? config.jevModel,
    contextMessageCount,
    durationMs: Math.round(performance.now() - startedAt),
  }));
}

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      console.info(JSON.stringify({ event: "bot_stopping", signal, ...stats.health() }));
      await bot.stop();
      const health = await stats.stop();
      console.info(JSON.stringify({ event: "bot_stopped", ...health }));
    })();
  }
  return shutdownPromise;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.info(JSON.stringify({
  event: "bot_starting",
  model: config.jevModel,
  threshold: config.spamThreshold,
  statsEnabled: Boolean(config.databaseUrl),
}));
try {
  await bot.start({
    allowed_updates: ["message", "edited_message", "my_chat_member", "chat_member"],
    onStart: ({ username }) => console.info(JSON.stringify({ event: "bot_started", username })),
  });
} finally {
  if (shutdownPromise) await shutdownPromise;
  else await stats.stop();
}
