import { expect, test } from "bun:test";
import { deletionMessageIds, MessageHistory } from "./history";

const message = (messageId: number, receivedAt: number) => ({
  messageId,
  receivedAt,
  text: `message ${messageId}`,
  embeddedLinks: [],
  isForwarded: false,
});

test("keeps bounded sender history for ten minutes", () => {
  const history = new MessageHistory(600_000, 2);
  history.remember(-1, 7, message(1, 0));
  history.remember(-1, 7, message(2, 100));
  history.remember(-1, 7, message(3, 200));

  expect(history.recent(-1, 7, 300).map(({ messageId }) => messageId)).toEqual([2, 3]);
  expect(history.recent(-1, 7, 600_201)).toEqual([]);
});

test("edited messages replace the remembered version", () => {
  const history = new MessageHistory();
  history.remember(-1, 7, message(1, 100));
  history.remember(-1, 7, { ...message(1, 200), text: "edited" });

  expect(history.recent(-1, 7, 300)).toHaveLength(1);
  expect(history.recent(-1, 7, 300)[0]?.text).toBe("edited");
});

test("isolates history by chat and sender", () => {
  const history = new MessageHistory();
  history.remember(-1, 7, message(1, 100));
  expect(history.recent(-1, 8, 200)).toEqual([]);
  expect(history.recent(-2, 7, 200)).toEqual([]);
});

test("deletes only prior messages linked to the contextual spam burst", () => {
  const recent = [message(1, 100), message(2, 200), message(3, 300)];
  expect(deletionMessageIds(recent, 4, [0.95, 0.2, 0.8], 0.75)).toEqual([3, 4]);
  expect(deletionMessageIds(recent, 4, [], 0.75)).toEqual([4]);
});
