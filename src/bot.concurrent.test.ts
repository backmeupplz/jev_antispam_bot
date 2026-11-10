import { expect, test } from "bun:test";

// The whole bot suite again, with updates going through handleConcurrently (#613): history, cache,
// linkage deletion and admin skips must behave exactly as with one update at a time.
test("bot.test.ts passes with concurrent update handling", () => {
  const run = Bun.spawnSync(["bun", "test", "src/bot.test.ts"], {
    cwd: `${import.meta.dir}/..`,
    env: { ...process.env, JEV_CONCURRENT_SUITE: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${run.stdout.toString()}${run.stderr.toString()}`;
  if (run.exitCode !== 0) console.error(output.split("\n").filter(line => /\(fail\)|error|Expected|Received/.test(line)).slice(0, 60).join("\n"));
  expect(run.exitCode).toBe(0);
  expect(output).toMatch(/\b0 fail\b/);
}, 120_000);
