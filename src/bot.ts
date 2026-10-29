import { type Api, Bot, type Context, GrammyError, HttpError } from "grammy";
import { AUDIT_CHAT_ID, type DeletionAudit } from "./audit-outbox";
import { auditSnapshot, renderAuditReport } from "./audit-report";
import { AdminCache, FloodWaitError } from "./admin-cache";
import { CampaignLedger, campaignPost, campaignText } from "./campaign";
import { deleteMessages } from "./deletion";
import { DeleteRetryQueue, prepareIntent, transientIntentFailure, type RetryOutcome } from "./delete-retry";
import { deletionMessageIds, MessageHistory } from "./history";
import { toModerationMessage } from "./message";
import { EnrichmentBudget, TelegramPreviewCache, type PageRequest } from "./telegram-preview";
import { SenderProfileCache, personalChannelLocator } from "./profile";
import { publicChannelUrl } from "./personal-posts";
import { PATTERN_MIN_SCORE, promoPattern } from "./promo-patterns";
import { CONTEXT_LINK_THRESHOLD, type JevSpamClassifier, type SpamAssessment } from "./spam";
import { cacheEligible, cacheFingerprint, confirmedSpam, type SpamCache } from "./spam-cache";
import { escalatedScore, MemoryRepeatStore, REPEAT_MIN_SCORE, repeatKey, RepeatSnapshots, type RepeatCopy, type RepeatStore } from "./repeat-sends";
import type { StatsRecorder } from "./stats";
import type { TrainingCapture } from "./training-capture";
import { telegramErrorReason } from "./telegram-errors";
import type { InlineKeyboardMarkup } from "grammy/types";
import { html, keyboard, type promos } from "./promo";

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
  repeats = new MemoryRepeatStore(),
  promo,
  isNewChat = async () => false,
  deleteRetries = new DeleteRetryQueue({ logger }),
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
  repeats?: RepeatStore;
  // Prime Radiant's reply promos (src/promo.ts): private /start and /status replies only
  promo?: ReturnType<typeof promos>;
  isNewChat?: (chatId: number) => Promise<boolean>;
  // Confirmed deletions whose audit intent could not be written yet (#277).
  deleteRetries?: DeleteRetryQueue;
}): void {
  const admins = new AdminCache();
  const history = new MessageHistory();
  const campaigns = new CampaignLedger();
  const profiles = new SenderProfileCache();
  const destinations = new TelegramPreviewCache({ request: previewRequest });
  const repeatSnapshots = new RepeatSnapshots();
  if (deletionAudit) deleteRetries.start();
  // Built here, not in the update handler, so a queued entry holds only its own report.
  const queueDeletion = (chatId: number, messageId: number, report: string | string[], source: "cache" | "jev") =>
    deleteRetries.add(chatId, messageId, () => retryDeletion(chatId, messageId, report, source));

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
        // An edit that is no longer moderated (e.g. its caption was removed) is no longer a copy.
        if ("edited_message" in ctx.update && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
          await repeats.forget(ctx.chat.id, ctx.msgId);
          repeatSnapshots.delete(ctx.chat.id, ctx.msgId);
        }
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
      // An edit is moderated afresh under its new content; it supersedes a deletion still waiting for its intent.
      if ("edited_message" in ctx.update) deleteRetries.forget(ctx.chat.id, ctx.msgId);

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
          isAdmin = await admins.isAdmin(ctx.api, ctx.chat.id, ctx.from, (outcome, reason) =>
            logger.info(JSON.stringify({ event: "admin_lookup", chatId: ctx.chat.id, messageId: ctx.msgId, outcome, ...(reason ? { reason } : {}) })));
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
        // Counts and origin types only (#145): never button labels, URLs or the origin's name.
        inlineButtonCount: message.inlineButtons?.length ?? 0,
        isForwarded: message.isForwarded,
        forwardOriginKind: "forward_origin" in ctx.msg && ctx.msg.forward_origin ? ctx.msg.forward_origin.type : null,
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
      let classificationFailed = false;
      try {
        if (!cacheHit) {
          stats.recordClassificationAttempt({ chatId: ctx.chat.id, messageId: ctx.msgId, updateId: ctx.update.update_id });
          const chatId = ctx.chat.id, messageId = ctx.msgId;
          assessment = await classifier.classify(classifierInput, context, trainingCapture
            && ((request, answers, result) => trainingCapture.record(chatId, messageId, request, answers, result)));
        }
      } catch (error) {
        classificationFailed = true;
        logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, undefined, recentMessages.length);
        logFailure("classification_failed", error, ctx.chat.id, ctx.msgId);
        logShadow("failed");
      }
      // A cache write failure is never a classification failure.
      if (fingerprint && assessment?.model === model && confirmedSpam(assessment, spamThreshold)) {
        try { await spamCache!.seed(fingerprint); } catch (error) { logFailure("spam_cache_seed_failed", error, ctx.chat.id, ctx.msgId); }
      }

      if (!classificationFailed) {
        if (assessment) logAnalysisResult(ctx.chat.id, ctx.msgId, analysisStartedAt, assessment, recentMessages.length);
        logShadow(cacheHit ? "cache_delete" : assessment!.shouldDelete ? "delete" : "keep", assessment);
      }

      // Repetition is decided by the bot, not the model: Laya scores repeated
      // copies lower because its training history only ever held kept messages.
      // Every eligible copy is recorded whatever the verdict, so model, cache and
      // campaign deletions all count towards the distinct posts.
      const post = mediaOnly ? undefined : campaignPost(ctx.msg);
      const copyText = post === undefined ? undefined : campaignText(message.text);
      const campaign = copyText === undefined ? undefined : campaigns.observe(ctx.chat.id, senderId,
        { messageId: ctx.msgId, text: copyText, post: post!, postedAt: ctx.msg.date * 1000, auditSnapshot: snapshot });
      if (copyText === undefined) campaigns.forget(ctx.chat.id, senderId, ctx.msgId);
      // An edit of an already handled copy re-finds its campaign but is not a new detection.
      if (campaign?.pending.length) logger.info(JSON.stringify({
        event: "repeat_campaign_detected", chatId: ctx.chat.id, messageId: ctx.msgId,
        copyCount: campaign.size,
        modelDecision: classificationFailed ? "failed" : cacheHit ? "cache_delete" : assessment!.shouldDelete ? "delete" : "keep",
      }));

      const modelDelete = cacheHit || Boolean(assessment?.shouldDelete);
      // Repeat sends (#124): the same account sending the same content again, in
      // this group or another one, raises the score. Across the gate, its earlier
      // copies in the window go too. A failed classification never counts.
      const isEdited = "edited_message" in ctx.update;
      const probability = cacheHit ? 1 : assessment?.probability;
      const key = mediaOnly || probability === undefined || !(probability >= REPEAT_MIN_SCORE) ? undefined : repeatKey(senderId, message.text);
      let copies: RepeatCopy[] = [];
      if (key) {
        copies = await repeats.record(key, { chatId: ctx.chat.id, messageId: ctx.msgId, sentAt: ctx.msg.date * 1000 }) ?? [];
        if (snapshot) repeatSnapshots.set(snapshot);
      } else if (isEdited) {
        await repeats.forget(ctx.chat.id, ctx.msgId);
        repeatSnapshots.delete(ctx.chat.id, ctx.msgId);
      }
      const effective = escalatedScore(probability ?? 0, copies.length);
      const repeatDelete = !modelDelete && copies.length > 0 && effective >= spamThreshold;
      // Ad shapes Laya keeps under the gate (#126, #142, #145): side-gig recruitment, first-person @…bot
      // testimonials, P2P crypto trade asks and explicit adult-content promotion, unless the model is confident it is benign.
      const pattern = modelDelete || repeatDelete || mediaOnly || probability === undefined ? undefined : promoPattern(message);
      const patternDelete = pattern !== undefined && probability! >= PATTERN_MIN_SCORE;
      if (pattern) logger.info(JSON.stringify({
        event: "promo_pattern_detected", chatId: ctx.chat.id, messageId: ctx.msgId, isEdited, pattern,
        confidence: probability, decision: patternDelete ? "pattern_delete" : "keep",
      }));
      // A copy already handled (deleted, or its delete failed) is never retried.
      const repeatCopies = modelDelete || repeatDelete || patternDelete ? copies.filter(c => !c.handled) : [];
      if (copies.length) logger.info(JSON.stringify({
        event: "repeat_send_detected", chatId: ctx.chat.id, messageId: ctx.msgId, isEdited,
        copyCount: copies.length + 1,
        otherChatCopyCount: copies.filter(c => c.chatId !== ctx.chat.id).length,
        confidence: probability,
        effectiveConfidence: Math.round(effective * 10_000) / 10_000,
        decision: cacheHit ? "cache_delete" : modelDelete ? "delete" : repeatDelete ? "repeat_delete" : patternDelete ? "pattern_delete" : "keep",
        pendingCopyCount: repeatCopies.length,
      }));

      // A copy already handled (e.g. an edit of a failed delete) is never retried.
      const campaignIds = (campaign?.pending ?? []).map(c => c.messageId);
      if (!modelDelete && !repeatDelete && !patternDelete && !campaignIds.length) {
        if (!mediaOnly && !campaign) history.remember(ctx.chat.id, senderId, { ...message, messageId: ctx.msgId, receivedAt: Date.now(), auditSnapshot: snapshot });
        await next();
        return;
      }

      // Profile-only evidence cannot prove earlier text was part of the ad.
      const linkedIds = !modelDelete ? [] : cacheHit || mediaOnly ? [ctx.msgId] : deletionMessageIds(
        recentMessages,
        ctx.msgId,
        assessment!.contextProbabilities,
        CONTEXT_LINK_THRESHOLD,
      );
      const repeatIds = repeatCopies.filter(c => c.chatId === ctx.chat.id).map(c => c.messageId);
      const ids = new Set([...linkedIds, ...campaignIds, ...repeatIds, ...(repeatDelete || patternDelete ? [ctx.msgId] : [])]);
      const messageIds = [...ids].filter(id => id !== ctx.msgId).sort((a, b) => a - b).concat(ids.has(ctx.msgId) ? [ctx.msgId] : []);
      // Earlier copies in the account's other groups, oldest first per group,
      // except where the account is exempt by now (admin or that group's linked channel).
      const otherChats = new Map<number, number[]>();
      for (const c of [...repeatCopies].sort((a, b) => a.messageId - b.messageId)) {
        if (c.chatId !== ctx.chat.id) otherChats.set(c.chatId, [...otherChats.get(c.chatId) ?? [], c.messageId]);
      }
      for (const chatId of otherChats.keys()) {
        try {
          if (ctx.senderChat) {
            const other = await ctx.api.getChat(chatId);
            if (other.id === chatId && !("linked_chat_id" in other && other.linked_chat_id === ctx.senderChat.id)) continue;
          } else if (!await admins.isAdmin(ctx.api, chatId, ctx.from!, undefined, { wait: false })) continue;
          logger.info(JSON.stringify({ event: "repeat_copy_skipped", chatId, reason: "exempt_sender" }));
        } catch (error) {
          logFailure("repeat_exemption_check_failed", error, chatId);
        }
        otherChats.delete(chatId);
      }
      // The rule that widened the deletion; only the current copy can be a cache hit.
      const rule = campaignIds.some(id => !linkedIds.includes(id)) ? "repeat_campaign"
        : repeatDelete ? "repeat_send" : patternDelete ? pattern! : repeatCopies.length ? "repeat_send" : cacheHit ? "cache" : "model";
      // Freeze each message’s own profile/content before clearing history.
      const snapshots = [...recentMessages, ...(campaign?.pending ?? [])].flatMap(m => m.auditSnapshot ? [m.auditSnapshot] : [])
        .concat(snapshot ? [snapshot, ...repeatCopies.map(c => repeatSnapshots.get(c, snapshot))] : []);
      if (messageIds.length > 1) history.clear(ctx.chat.id, senderId);

      // Once one intent in this update is deferred, the rest are queued without waiting out the same stall.
      let auditDeferred = false;
      const deleteOne = async (chatId: number, messageId: number) => {
        let intent: string | undefined;
        if (deletionAudit) {
          const own = snapshots.find(s => s.chatId === chatId && s.messageId === messageId);
          if (!own) { logger.error(JSON.stringify({ event: "deletion_audit", outcome: "snapshot_missing" })); throw new Error("Audit snapshot unavailable"); }
          const report = renderAuditReport(own);
          const prepared = auditDeferred ? { refusal: "unavailable" as const } : await prepareIntent(deletionAudit, chatId, messageId, report);
          if ("refusal" in prepared) {
            // A deletion still never runs without its intent: a transient failure only defers it (#277).
            const source = cacheHit && chatId === ctx.chat.id && messageId === ctx.msgId ? "cache" : "jev";
            const deferred = transientIntentFailure(prepared.refusal) && queueDeletion(chatId, messageId, report, source);
            auditDeferred ||= deferred;
            logger.error(JSON.stringify({ event: "deletion_audit", outcome: deferred ? "intent_unavailable_delete_deferred" : "intent_unavailable_delete_skipped", reason: prepared.refusal }));
            throw new Error("Audit intent unavailable");
          }
          if (prepared.attempts > 1) logger.info(JSON.stringify({ event: "deletion_audit", outcome: "intent_prepared_after_retry", attempts: prepared.attempts }));
          intent = prepared.id;
        }
        await deleteUnderIntent(ctx.api, chatId, messageId, intent);
      };
      const handled = async (chatId: number, messageId: number) => {
        campaigns.markHandled(chatId, senderId, messageId);
        if (chatId !== ctx.chat.id) history.forget(chatId, senderId, messageId);
        repeatSnapshots.delete(chatId, messageId);
        await repeats.markHandled(chatId, messageId);
      };
      let deletedMessageCount = 0;
      for (const [chatId, chatMessageIds] of [[ctx.chat.id, messageIds] as const, ...otherChats]) {
        deletedMessageCount += await deleteMessages(
          chatId,
          [...chatMessageIds],
          deleteOne,
          async (chatId, messageId) => {
            stats.recordDeletion({ chatId, messageId, source: cacheHit && chatId === ctx.chat.id && messageId === ctx.msgId ? "cache" : "jev" });
            await handled(chatId, messageId);
          },
          async (error, messageId) => {
            logFailure("delete_failed", error, chatId, messageId);
            await handled(chatId, messageId);
          },
        );
      }

      if (deletedMessageCount) {
        logger.info(JSON.stringify({
          event: "spam_deleted",
          chatId: ctx.chat.id,
          messageId: ctx.msgId,
          deletedMessageCount,
          attemptedMessageCount: messageIds.length + [...otherChats.values()].reduce((n, l) => n + l.length, 0),
          otherChatCount: otherChats.size,
          source: cacheHit ? "cache" : "jev",
          rule,
          signal: assessment?.strongestSignal,
          probability: assessment?.probability,
          ...(repeatDelete ? { effectiveProbability: Math.round(effective * 10_000) / 10_000 } : {}),
          model: assessment?.model ?? model,
        }));
      }
    },
  );

  // A private reply with the user's promo line or button, if their experiment arm has one
  async function privateReply(ctx: Context, text: string) {
    const d = await promo?.decide(ctx.from?.id, ctx.chat?.type, ctx.from?.language_code);
    await ctx.reply(text + html(d?.promo), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard<InlineKeyboardMarkup>(d?.promo),
    });
    await promo?.record(d);
  }

  bot.command("start", async (ctx) => {
    const text = "I delete high-confidence Telegram spam using Jev. Add me to a group as an administrator with permission to delete messages.";
    if (ctx.chat.type !== "private") {
      await ctx.reply(text);
      return;
    }
    // /start <campaign>-<variant>-<bot> from another bot's promo
    if (promo && ctx.match) await promo.arrived(ctx.from?.id, ctx.match, await isNewChat(ctx.chat.id));
    await privateReply(ctx, text);
  });

  bot.command("status", async (ctx) => {
    if (ctx.chat.type === "private") {
      await privateReply(ctx, "Online. Add me to a group as an administrator with permission to delete messages.");
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
    if (ctx.chat.type === "private" && member.status === "kicked") promo?.blocked(ctx.from?.id);
    // someone a campaign brought here adds Jev to a group: use
    if (ctx.chat.type !== "private" && (member.status === "member" || member.status === "administrator")) await promo?.used(ctx.from?.id);
    if (member.status === "left" || member.status === "kicked") return;

    const canDelete = member.status === "administrator" && member.can_delete_messages;
    await ctx.reply(
      canDelete
        ? "Jev Anti-Spam is active. I will delete only high-confidence spam."
        : "Grant me administrator permission to delete messages, then run /status.",
    );
  });

  bot.on("chat_member", async (ctx) => {
    const member = ctx.chatMember.new_chat_member;
    admins.update(ctx.chat.id, member.user.id, member.status);
  });

  /** deleteMessage under a prepared intent (if auditing), then records the intent's outcome. */
  async function deleteUnderIntent(api: Api, chatId: number, messageId: number, intent?: string) {
    try {
      const deleted = await api.deleteMessage(chatId, messageId, AbortSignal.timeout(8_000) as Parameters<Api["deleteMessage"]>[2]);
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
  }

  /** One queued attempt: the same intent-then-delete rule as the update handler; content-free outcome. */
  async function retryDeletion(chatId: number, messageId: number, report: string | string[], source: "cache" | "jev"): Promise<RetryOutcome> {
    // One prepare() per queued attempt: the queue's own schedule is the retry.
    const prepared = await prepareIntent(deletionAudit!, chatId, messageId, report, { delaysMs: [] });
    if ("refusal" in prepared) {
      return { outcome: transientIntentFailure(prepared.refusal) ? "deferred" : prepared.refusal === "duplicate" ? "duplicate" : "refused", reason: prepared.refusal };
    }
    try { await deleteUnderIntent(bot.api, chatId, messageId, prepared.id); }
    catch (error) { return { outcome: "delete_failed", ...failureClass(error) }; }
    stats.recordDeletion({ chatId, messageId, source });
    return { outcome: "deleted" };
  }

  bot.catch(({ error, ctx }) => {
    logFailure("update_failed", error, ctx.chat?.id, ctx.msgId);
  });

  function logFailure(event: string, error: unknown, chatId?: number, messageId?: number): void {
    const { kind, reason } = failureClass(error);
    const retryAfter = error instanceof GrammyError ? error.parameters?.retry_after : undefined;
    logger.error(JSON.stringify({ event, kind, ...(reason ? { reason } : {}), ...(retryAfter !== undefined ? { retryAfter } : {}), chatId, messageId }));
  }

  function failureClass(error: unknown): { kind: string; reason?: string } {
    const kind = error instanceof GrammyError
      ? `telegram_${error.error_code}`
      : error instanceof HttpError
        ? "telegram_network"
        : error instanceof FloodWaitError
          ? "telegram_flood_wait"
          : error instanceof Error
            ? "error"
            : "unknown";
    // reason is an allowlisted class of Telegram's description, never the description itself.
    const reason = telegramErrorReason(error);
    return { kind, ...(reason ? { reason } : {}) };
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
