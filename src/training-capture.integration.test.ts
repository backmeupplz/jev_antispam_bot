import { expect, test } from "bun:test";
import pg from "pg";
import { PostgresTrainingCapture } from "./training-capture";
const url = process.env.TEST_DATABASE_URL;
if (url && !["/jev_stats_test", "/jev_ticket5_test"].includes(new URL(url).pathname)) throw new Error("Dedicated test database required");
const integration = url ? test : test.skip;

integration("training capture stores request/answers and prunes by age and row cap", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const assessment = { shouldDelete: true, probability: 0.97, strongestSignal: "easy_money_bait", model: "jev-1.13.0", signals: {}, contextProbabilities: [] } as never;
  const capture = new PostgresTrainingCapture(url!, { maxRows: 2 });
  const settle = async () => { while ((capture as unknown as { inFlight: number }).inFlight) await Bun.sleep(10); };
  capture.record(-1001, 1, { state: { message: { text: "earn" } } }, { easy_money_bait: { noul: 0.97 } }, assessment); await settle();
  await pool.query("DELETE FROM training_samples"); (capture as unknown as { lastPrune: number }).lastPrune = 0;
  for (const id of [1, 2, 3]) { capture.record(-1001, id, { state: { message: { text: `m${id}` } } }, {}, assessment); await settle(); }
  expect(capture.counters).toMatchObject({ stored: 4, failed: 0 });
  // First insert after the hourly window pruned; later ones did not.
  expect((await pool.query("SELECT message_id::int FROM training_samples ORDER BY id")).rows.map(r => r.message_id)).toEqual([1, 2, 3]);
  await pool.query("UPDATE training_samples SET created_at = NOW() - INTERVAL '40 days' WHERE message_id = 1");
  (capture as unknown as { lastPrune: number }).lastPrune = 0;
  capture.record(-1001, 4, { state: {} }, {}, assessment); await settle();
  expect((await pool.query("SELECT message_id::int, request->'state' AS state FROM training_samples ORDER BY id")).rows)
    .toEqual([{ message_id: 3, state: { message: { text: "m3" } } }, { message_id: 4, state: {} }]);
  await capture.close(); await pool.end();
});
