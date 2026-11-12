export async function deleteMessages(
  chatId: number,
  messageIds: number[],
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>,
  onDeleted: (chatId: number, messageId: number) => unknown,
  onFailure: (error: unknown, messageId: number) => unknown,
): Promise<number> {
  let deletedMessageCount = 0;
  for (const messageId of messageIds) {
    try {
      await deleteMessage(chatId, messageId);
    } catch (error) {
      await onFailure(error, messageId);
      continue;
    }
    deletedMessageCount += 1;
    await onDeleted(chatId, messageId);
  }
  return deletedMessageCount;
}

// #634: which chats had their delete rights looked up after a refused delete, so each is checked (and logged) at most once a day.
export class DeleteRightsChecks {
  // chatId -> when its rights were last looked up (ms)
  private readonly checked = new Map<number, number>();

  constructor(private readonly ttlMs = 24 * 60 * 60_000, private readonly maxChats = 10_000, private readonly retryMs = 10 * 60_000) {}

  /**
   * The lookup itself failed (timeout, 429, network): the chat is due again after `retryMs` instead of a day, so missing rights are
   * still reported soon. It stays recorded meanwhile, so a burst of refused deletes does not fire a lookup each.
   */
  failed(chatId: number, now = Date.now()): void {
    if (this.checked.has(chatId)) this.checked.set(chatId, now - this.ttlMs + this.retryMs);
  }

  /** True, and recorded, when this chat's rights are due for a lookup now. */
  due(chatId: number, now = Date.now()): boolean {
    const at = this.checked.get(chatId);
    if (at !== undefined && now - at < this.ttlMs) return false;
    this.checked.delete(chatId);
    if (this.checked.size >= this.maxChats) this.checked.delete(this.checked.keys().next().value!);
    this.checked.set(chatId, now);
    return true;
  }
}
