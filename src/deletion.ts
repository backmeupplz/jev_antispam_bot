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
