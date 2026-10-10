import { Bot, GrammyError, HttpError } from "grammy";
import { AUDIT_CHAT_ID, type DeletionAudit } from "./audit-outbox";
import { auditSnapshot, renderAuditReport } from "./audit-report";
import { AdminCache } from "./admin-cache";
import { deleteMessages } from "./deletion";
import { deletionMessageIds, MessageHistory } from "./history";
import { toModerationMessage } from "./message";
import { EnrichmentBudget, TelegramPreviewCache, type PageRequest } from "./telegram-preview";
import { SenderProfileCache, personalChannelLocator } from "./profile";
import { publicChannelUrl } from "./personal-posts";
import { CONTEXT_LINK_THRESHOLD, type JevSpamClassifier, type SpamAssessment } from "./spam";
import { cacheEligible, cacheFingerprint, confirmedSpam, type SpamCache } from "./spam-cache";
import type { StatsRecorder } from "./stats";
import type { TrainingCapture } from "./training-capture";

export function registerBotHandlers(bot: Bot, {
  classifier,
  shadowClassifier,
  trainingCapture,
  deletionAudit,
  model,
  stats,
  logger = console,
  previewRequest,
  spamCache,
  spamThreshold = 0.81,
}: {
  classifier: Pick<JevSpamClassifier, "classify">;
  shadowClassifier?: Pick<JevSpamClassifier, "classify">;
  trainingCapture?: TrainingCapture;
  deletionAudit?: DeletionAudit;
  model: string;
  stats: StatsRecorder;
  logger?: Pick<Console, "info" | "error">;
  previewRequest?: PageRequest;
  spamCache?: SpamCache;
  spamThreshold?: number;
}): void {
  const admins = new AdminCache();
  const history = new MessageHistory();
  const profiles = new SenderProfileCache();
  const destinations = new TelegramPreviewCache({ request: previewRequest });

  bot.use(async (ctx, next) => {
    // Exclude the sink before stats, enrichment, history, capture and commands.
    if (ctx.chat?.id === AUDIT_CHAT_ID) return;
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
      const mediaOnly = Boolean(message?.mediaOnly);
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
        if (ctx.from.id === bot.botInfo.id) {
          await skip("bot_itself");
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
        // Delivered third-party bots use normal admin checks and actor history,
        // but never human-profile enrichment (including media-only eligibility).
        if (!ctx.from.is_bot) profileUserId = ctx.from.id;
      }

      const analysisStartedAt = performance.now();
      let senderProfile;
      let enrichmentComplete = true;
      if (spamCache && cacheEligible(ctx.msg) && profileUserId !== undefined) profiles.invalidate(profileUserId);
      if (profileUserId !== undefined && message.text.length <= 280) {
        try {
          senderProfile = await profiles.get(
            profileUserId,
            (chatId, signal) => ctx.api.getChat(
              chatId,
              signal as Parameters<typeof ctx.api.getChat>[1],
            ),
            Date.now(),
            (source, outcome) => {
              if (["unavailable", "invalid", "cached_unavailable"].includes(outcome)) enrichmentComplete = false;
              logger.info(JSON.stringify({ event: "profile_lookup", chatId: ctx.chat.id, messageId: ctx.msgId, source, outcome }));
            },
          );
        } catch (error) {
          enrichmentComplete = false;
          logFailure("profile_metadata_failed", error, ctx.chat.id, ctx.msgId);
        }
      }
      // Uncaptioned media needs actual sender-owned profile metadata.
      if (mediaOnly && !senderProfile) {
        await skip("media_profile_unavailable");
        return;
      }
      const enrichmentBudget = new EnrichmentBudget();
      try {
        const destinationPreviews = await destinations.enrich(ctx.msg, (result, source, durationMs) =>
          logger.info(JSON.stringify({ event: "telegram_preview_lookup", result, source, durationMs })), enrichmentBudget);
        if (destinationPreviews.length) message.destinationPreviews = destinationPreviews;
      } catch {
        enrichmentComplete = false;
        // Optional enrichment must never bypass otherwise eligible moderation.
        logger.info(JSON.stringify({ event: "telegram_preview_lookup", result: "unavailable" }));
      }
      // Cached profile ownership is not enough for a public-web username lookup.
      // Revalidate the numeric channel and current username before using its page.
      const locator = senderProfile && personalChannelLocator(senderProfile);
      if (senderProfile?.personalChannel && locator) {
        try {
          const currentUser = await ctx.api.getChat(profileUserId!, AbortSignal.any([enrichmentBudget.signal, AbortSignal.timeout(1500)]) as Parameters<typeof ctx.api.getChat>[1]);
          if (currentUser.type !== "private" || currentUser.id !== profileUserId
            || currentUser.personal_chat?.type !== "channel" || currentUser.personal_chat.id !== locator.id) throw new Error("Profile relationship unavailable");
          const channel = await ctx.api.getChat(locator.id, AbortSignal.any([enrichmentBudget.signal, AbortSignal.timeout(1500)]) as Parameters<typeof ctx.api.getChat>[1]);
          if (channel.type === "channel" && channel.id === locator.id && channel.username
            && publicChannelUrl(channel.username) === locator.url) {
            const posts = await destinations.personalPosts(locator, enrichmentBudget);
            if (posts.length) senderProfile = { ...senderProfile, personalChannel: { ...senderProfile.personalChannel, posts } };
          }
        } catch { /* Optional public context fails open without raw error telemetry. */ }
      }
      const moderationMessage = message;
      const recentMessages = history.recent(ctx.chat.id, senderId, Date.now(), ctx.msgId);
      logger.info(JSON.stringify({
        event: "message_analysis_started",
        chatId: ctx.chat.id,
        messageId: ctx.msgId,
        characterCount: message.text.length,
        embeddedLinkCount: message.embeddedLinks.length,
        isForwarded: message.isForwarded,
        preview: message.preview?.map(({ kind, origin, sourceKind, sourceAuthor, text, embeddedLinks }) => ({
          kind, origin, sourceKind, sourceAuthor, contentAvailable: Boolean(text?.trim()),
          characterCount: text?.length ?? 0, embeddedLinkCount: embeddedLinks.length,
        })) ?? [],
        mediaOnly: Boolean(mediaOnly),
        isEdited: "edited_message" in ctx.update,
        contextMessageCount: recentMessages.length,
        senderProfilePresent: Boolean(senderProfile),
      }));

      const classifierInput = senderProfile ? { ...moderationMessage, senderProfile } : moderationMessage;
      const snapshot = deletionAudit ? auditSnapshot(ctx.msg, classifierInput, "edited_message" in ctx.update) : undefined;
      const fingerprint = spamCache ? cacheFingerprint(ctx.msg, senderId, classifierInput,
        recentMessages.length, model, spamThreshold, enrichmentComplete) : undefined;
      const cacheHit = fingerprint ? await spamCache!.lookup(fingerprint) : false;
      const context = recentMessages.map(({ text, embeddedLinks, inlineButtons, isForwarded, preview, destinationPreviews }) => ({
        text, embeddedLinks, isForwarded, ...(preview ? { preview } : {}),
        ...(inlineButtons ? { inlineButtons } : {}),
        ...(destinationPreviews ? { destinationPreviews } : {}),
      }));
      const logShadow = shadowClassifier
        ? startShadow(shadowClassifier.classify(classifierInput, context), ctx.chat.id, ctx.msgId, "edited_message" in ctx.update)
        : () => {};
      let assessment: SpamAssessment | undefined;
      try {
        if (!cacheHit) {
          stats.recordClassificationAttempt({ chatId: ctx.chat.id, messageId: ctx.msgId, updateId: ctx.update.update_id });
          const chatId = ctx.chat.id, messageId = ctx.msgId;
          assessment = await classifier.classify(classifierInput, context, trainingCapture
            && ((request, answers, result) => trainingCapture.record(chatId, messageId, request, answers, result)));
          if (fingerprint && assessment.model === model && confirmedSpam(assessment, spamThreshold)) await spamCache!.seed(fingerprint);
        }
      } catch (error) {
        if (!mediaOnly) history.remember(ctx.chat.id, senderId, { ...message, messageId: ctx.msgId, receivedAt: Date.now(), auditSnapshot: snapshot });
        logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, undefined, recentMessages.length);
        logFailure("classification_failed", error, ctx.chat.id, ctx.msgId);
        logShadow("failed");
        await next();
        return;
      }

      if (assessment) logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, assessment, recentMessages.length);
      logShadow(cacheHit ? "cache_delete" : assessment!.shouldDelete ? "delete" : "keep", assessment);

      if (!cacheHit && !assessment?.shouldDelete) {
        if (!mediaOnly) history.remember(ctx.chat.id, senderId, { ...message, messageId: ctx.msgId, receivedAt: Date.now(), auditSnapshot: snapshot });
        await next();
        return;
      }

      // Profile-only evidence cannot prove earlier text was part of the ad.
      const messageIds = cacheHit || mediaOnly ? [ctx.msgId] : deletionMessageIds(
        recentMessages,
        ctx.msgId,
        assessment!.contextProbabilities,
        CONTEXT_LINK_THRESHOLD,
      );
      // Freeze each message’s own profile/content before clearing history.
      const snapshots = [...recentMessages.flatMap(m => m.auditSnapshot ? [m.auditSnapshot] : []), ...(snapshot ? [snapshot] : [])];
      if (messageIds.length > 1) history.clear(ctx.chat.id, senderId);

      const deletedMessageCount = await deleteMessages(
        ctx.chat.id,
        messageIds,
        async (chatId, messageId) => {
          let intent: string | undefined;
          if (deletionAudit) {
            const own = snapshots.find(s => s.messageId === messageId);
            if (!own) { logger.error(JSON.stringify({ event: "deletion_audit", outcome: "snapshot_missing" })); throw new Error("Audit snapshot unavailable"); }
            try {
              intent = await deletionAudit.prepare(chatId, messageId, renderAuditReport(own));
            } catch { /* Persistence failures never become classifier failures. */ }
            if (!intent) { logger.error(JSON.stringify({ event: "deletion_audit", outcome: "intent_unavailable_delete_skipped" })); throw new Error("Audit intent unavailable"); }
          }
          try {
            const deleted = await ctx.api.deleteMessage(chatId, messageId, AbortSignal.timeout(8_000) as Parameters<typeof ctx.api.deleteMessage>[2]);
            if (deleted !== true) throw new Error("Unconfirmed deletion");
          } catch (error) {
            if (intent) {
              try { await deletionAudit!.failed(intent, !(error instanceof GrammyError && error.error_code >= 400 && error.error_code < 500)); }
              catch { logger.error(JSON.stringify({ event: "deletion_audit", outcome: "failure_state_unavailable" })); }
            }
            throw error;
          }
          if (intent) {
            try { await deletionAudit!.confirmed(intent); }
            catch { logger.error(JSON.stringify({ event: "deletion_audit", outcome: "confirmation_state_unavailable" })); }
          }
        },
        (chatId, messageId) => stats.recordDeletion({ chatId, messageId, source: cacheHit ? "cache" : "jev" }),
        (error, messageId) => logFailure("delete_failed", error, ctx.chat.id, messageId),
      );

      if (deletedMessageCount) {
        logger.info(JSON.stringify({
          event: "spam_deleted",
          chatId: ctx.chat.id,
          messageId: ctx.msgId,
          deletedMessageCount,
          attemptedMessageCount: messageIds.length,
          source: cacheHit ? "cache" : "jev",
          signal: assessment?.strongestSignal,
          probability: assessment?.probability,
          model: assessment?.model ?? model,
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

  // Shadow verdicts are compared offline (scripts/compare-shadow.ts) and never delete.
  function startShadow(run: Promise<SpamAssessment>, chatId: number, messageId: number, isEdited: boolean) {
    const startedAt = performance.now();
    const settled = run.then(
      (shadow) => ({ shadow, durationMs: Math.round(performance.now() - startedAt) }),
      (error: unknown) => ({ error: error instanceof Error && error.name === "TimeoutError" ? "timeout"
        : error instanceof Error ? error.message.slice(0, 120) : "unknown", durationMs: Math.round(performance.now() - startedAt) }),
    );
    return (primary: "delete" | "keep" | "cache_delete" | "failed", primaryAssessment?: SpamAssessment) => void settled.then((result) => {
      const shadow = "shadow" in result ? result.shadow : undefined;
      logger.info(JSON.stringify({
        event: "shadow_analyzed",
        status: shadow ? "completed" : "failed",
        chatId,
        messageId,
        isEdited,
        primaryDecision: primary,
        primaryConfidence: primaryAssessment?.probability ?? null,
        primarySignals: primaryAssessment?.signals ?? null,
        decision: shadow ? (shadow.shouldDelete ? "delete" : "keep") : null,
        confidence: shadow?.probability ?? null,
        strongestSignal: shadow?.strongestSignal ?? null,
        signals: shadow?.signals ?? null,
        contextProbabilities: shadow?.contextProbabilities ?? null,
        model: shadow?.model ?? null,
        route: shadow?.route ?? null,
        truncated: shadow?.truncated ?? null,
        error: "error" in result ? result.error : null,
        durationMs: result.durationMs,
      }));
    });
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
