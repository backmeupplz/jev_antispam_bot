export async function deleteMessages(
  chatId: number,
  messageIds: number[],
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>,
  onDeleted: (chatId: number, messageId: number) => void,
  onFailure: (error: unknown, messageId: number) => void,
): Promise<number> {
  let deletedMessageCount = 0;
  for (const messageId of messageIds) {
    try {
      await deleteMessage(chatId, messageId);
      deletedMessageCount += 1;
      onDeleted(chatId, messageId);
    } catch (error) {
      onFailure(error, messageId);
    }
  }
  return deletedMessageCount;
}
