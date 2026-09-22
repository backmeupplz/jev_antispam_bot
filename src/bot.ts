import { Bot, GrammyError, HttpError } from "grammy";
import { AdminCache } from "./admin-cache";
import { deleteMessages } from "./deletion";
import { deletionMessageIds, MessageHistory } from "./history";
import { toModerationMessage } from "./message";
import { SenderProfileCache } from "./profile";
import { CONTEXT_LINK_THRESHOLD, type JevSpamClassifier, type SpamAssessment } from "./spam";
import type { StatsRecorder } from "./stats";

export function registerBotHandlers(bot: Bot, {
  classifier,
  model,
  stats,
  logger = console,
}: {
  classifier: Pick<JevSpamClassifier, "classify">;
  model: string;
  stats: StatsRecorder;
  logger?: Pick<Console, "info" | "error">;
}): void {
  const admins = new AdminCache();
  const history = new MessageHistory();
  const profiles = new SenderProfileCache();

  bot.use(async (ctx, next) => {
    if (ctx.chat) stats.observeChat({ chatId: ctx.chat.id, chatType: ctx.chat.type });
    await next();
  });

  bot.on(
    ["message", "edited_message"],
    async (ctx, next) => {
      const skip = async (reason: string): Promise<void> => {
        logger.info(JSON.stringify({
          event: "message_skipped",
          chatId: ctx.chat.id,
          messageId: ctx.msgId,
          reason,
          decision: "keep",
          isEdited: "edited_message" in ctx.update,
        }));
        await next();
      };
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") {
        await skip(ctx.chat.type === "private" ? "private_chat" : "unsupported_chat_type");
        return;
      }

      const message = toModerationMessage(ctx.msg);
      if (!message) {
        await skip("no_text_or_caption");
        return;
      }

      // sender_chat is the real actor; Telegram may attach a synthetic bot `from`.
      // Neither that synthetic user nor forward_origin proves administrator status.
      let senderId: string;
      let profileUserId: number | undefined;
      if (ctx.senderChat) {
        if (ctx.senderChat.id === ctx.chat.id && ctx.senderChat.type === ctx.chat.type) {
          await skip("anonymous_group_admin");
          return;
        }
        if (ctx.senderChat.type !== "channel") {
          await skip("unsupported_sender_chat");
          return;
        }
        let group;
        try {
          // Fetch the receiving group's current relationship, not the channel's
          // name, forward flag, or cached metadata from an older linked channel.
          group = await ctx.api.getChat(ctx.chat.id);
        } catch (error) {
          logFailure("sender_chat_check_failed", error, ctx.chat.id, ctx.msgId);
          await skip("sender_chat_metadata_failed");
          return;
        }
        if (group.id !== ctx.chat.id || group.type !== ctx.chat.type) {
          await skip("sender_chat_metadata_invalid");
          return;
        }
        if ("linked_chat_id" in group && group.linked_chat_id === ctx.senderChat.id) {
          await skip("official_linked_channel");
          return;
        }
        senderId = `chat:${ctx.senderChat.id}`;
      } else {
        if (!ctx.from) {
          await skip("missing_sender");
          return;
        }
        if (ctx.from.id === bot.botInfo.id || ctx.from.is_bot) {
          await skip(ctx.from.id === bot.botInfo.id ? "bot_itself" : "bot_sender");
          return;
        }
        let isAdmin;
        try {
          isAdmin = await admins.isAdmin(ctx.api, ctx.chat.id, ctx.from.id);
        } catch (error) {
          logFailure("admin_check_failed", error, ctx.chat.id, ctx.msgId);
          await skip("admin_metadata_failed");
          return;
        }
        if (isAdmin) {
          await skip("group_admin");
          return;
        }
        senderId = `user:${ctx.from.id}`;
        profileUserId = ctx.from.id;
        const forwardOrigin = "forward_origin" in ctx.msg ? ctx.msg.forward_origin : undefined;
        if (forwardOrigin?.type === "user" && !forwardOrigin.sender_user.is_bot) {
          profileUserId = forwardOrigin.sender_user.id;
        }
      }

      const analysisStartedAt = performance.now();
      let senderProfile;
      if (profileUserId !== undefined && message.text.length <= 280) {
        try {
          senderProfile = await profiles.get(
            profileUserId,
            (chatId, signal) => ctx.api.getChat(
              chatId,
              signal as Parameters<typeof ctx.api.getChat>[1],
            ),
          );
        } catch (error) {
          logFailure("profile_metadata_failed", error, ctx.chat.id, ctx.msgId);
        }
      }
      const recentMessages = history.recent(ctx.chat.id, senderId, Date.now(), ctx.msgId);
      logger.info(JSON.stringify({
        event: "message_analysis_started",
        chatId: ctx.chat.id,
        messageId: ctx.msgId,
        characterCount: message.text.length,
        embeddedLinkCount: message.embeddedLinks.length,
        isForwarded: message.isForwarded,
        isEdited: "edited_message" in ctx.update,
        contextMessageCount: recentMessages.length,
        senderProfilePresent: Boolean(senderProfile),
      }));

      let assessment;
      try {
        stats.recordClassificationAttempt({
          chatId: ctx.chat.id,
          messageId: ctx.msgId,
          updateId: ctx.update.update_id,
        });
        assessment = await classifier.classify(
          senderProfile ? { ...message, senderProfile } : message,
          recentMessages.map(({ text, embeddedLinks, isForwarded }) => ({ text, embeddedLinks, isForwarded })),
        );
      } catch (error) {
        history.remember(ctx.chat.id, senderId, { ...message, messageId: ctx.msgId, receivedAt: Date.now() });
        logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, undefined, recentMessages.length);
        logFailure("classification_failed", error, ctx.chat.id, ctx.msgId);
        await next();
        return;
      }

      logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, assessment, recentMessages.length);

      if (!assessment.shouldDelete) {
        history.remember(ctx.chat.id, senderId, { ...message, messageId: ctx.msgId, receivedAt: Date.now() });
        await next();
        return;
      }

      const messageIds = deletionMessageIds(
        recentMessages,
        ctx.msgId,
        assessment.contextProbabilities,
        CONTEXT_LINK_THRESHOLD,
      );
      if (messageIds.length > 1) history.clear(ctx.chat.id, senderId);

      const deletedMessageCount = await deleteMessages(
        ctx.chat.id,
        messageIds,
        (chatId, messageId) => ctx.api.deleteMessage(chatId, messageId),
        (chatId, messageId) => stats.recordDeletion({ chatId, messageId }),
        (error, messageId) => logFailure("delete_failed", error, ctx.chat.id, messageId),
      );

      if (deletedMessageCount) {
        logger.info(JSON.stringify({
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
          ? "error"
          : "unknown";
    logger.error(JSON.stringify({ event, kind, chatId, messageId }));
  }

  function logAnalysisResult(
    chatId: number,
    messageId: number,
    startedAt: number,
    assessment?: SpamAssessment,
    contextMessageCount = 0,
  ): void {
    logger.info(JSON.stringify({
      event: "message_analyzed",
      status: assessment ? "completed" : "failed",
      chatId,
      messageId,
      decision: assessment?.shouldDelete ? "delete" : "keep",
      confidence: assessment?.probability ?? null,
      strongestSignal: assessment?.strongestSignal ?? null,
      signals: assessment?.signals ?? null,
      contextProbabilities: assessment?.contextProbabilities ?? null,
      model: assessment?.model ?? model,
      contextMessageCount,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  }
}
