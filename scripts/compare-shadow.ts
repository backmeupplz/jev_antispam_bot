// Compare shadow-classifier verdicts with the primary (Jev) ones from bot logs.
// Usage: docker service logs <service> 2>&1 | bun scripts/compare-shadow.ts [threshold]
const threshold = Number(process.argv[2] ?? process.env.SPAM_THRESHOLD ?? 0.81);

type Row = {
  status: string; chatId: number; messageId: number; primaryDecision: string;
  primaryConfidence: number | null; confidence: number | null; strongestSignal: string | null;
  model: string | null; route: string | null; truncated: boolean | null; error: string | null; durationMs: number;
};

const rows: Row[] = [];
for (const line of (await Bun.stdin.text()).split("\n")) {
  const start = line.indexOf("{\"event\":\"shadow_analyzed\"");
  if (start >= 0) try { rows.push(JSON.parse(line.slice(start))); } catch { /* partial line */ }
}
const done = rows.filter((row) => row.status === "completed" && row.primaryDecision !== "failed");
const primarySpam = (row: Row) => row.primaryDecision !== "keep";
const shadowSpam = (row: Row, gate = threshold) => (row.confidence ?? 0) >= gate;
const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "-";
const ms = done.map((row) => row.durationMs).sort((a, b) => a - b);
const errors = Object.entries(Object.groupBy(rows.filter((row) => row.status !== "completed"), (row) => row.error ?? "?"))
  .map(([error, list]) => `${error}=${list!.length}`).join(" ");

console.log(`shadow rows ${rows.length}, compared ${done.length}, shadow failures ${rows.length - done.length - rows.filter((r) => r.primaryDecision === "failed").length} ${errors}`);
console.log(`models ${[...new Set(done.map((row) => `${row.model}${row.route ? `/${row.route}` : ""}`))].join(", ")}; truncated ${done.filter((row) => row.truncated).length}`);
console.log(`shadow latency p50 ${ms[Math.floor(ms.length / 2)] ?? "-"}ms p95 ${ms[Math.floor(ms.length * 0.95)] ?? "-"}ms\n`);

console.log("gate   agree   both-spam  jev-only(missed)  shadow-only(extra)");
for (const gate of [...new Set([0.5, 0.6, 0.7, 0.75, 0.81, 0.85, 0.9, 0.95, 0.99, threshold])].sort()) {
  const tp = done.filter((row) => primarySpam(row) && shadowSpam(row, gate)).length;
  const fn = done.filter((row) => primarySpam(row) && !shadowSpam(row, gate)).length;
  const fp = done.filter((row) => !primarySpam(row) && shadowSpam(row, gate)).length;
  console.log(`${gate.toFixed(2).padEnd(6)} ${pct(done.length - fn - fp, done.length).padEnd(7)} ${String(tp).padEnd(10)} ${String(fn).padEnd(17)} ${fp}`);
}

// Kept messages are still in the chat; deleted ones are gone, so only their verdicts remain.
const link = (row: Row) => String(row.chatId).startsWith("-100")
  ? `https://t.me/c/${String(row.chatId).slice(4)}/${row.messageId}` : `${row.chatId}/${row.messageId}`;
const disagreements = done.filter((row) => primarySpam(row) !== shadowSpam(row));
console.log(`\ndisagreements at ${threshold} (${disagreements.length}):`);
for (const row of disagreements) {
  console.log(`${primarySpam(row) ? "jev-only   " : "shadow-only"} jev=${row.primaryConfidence?.toFixed(3) ?? row.primaryDecision} shadow=${row.confidence?.toFixed(3)} ${row.strongestSignal} ${link(row)}`);
}
