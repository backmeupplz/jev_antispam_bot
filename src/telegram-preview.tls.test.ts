import { expect, test } from "bun:test";
import { request, createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestPublicTelegramPage } from "./telegram-preview";

// Real TLS, not a mocked response: a test-only CA/leaf for t.me, never trusted
// globally. The socket seam maps the already-validated public IP to loopback.
// No production URL/IP admission or certificate validation is relaxed.
test("pinned HTTPS preserves hostname identity and rejects wrong/untrusted certificates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-preview-tls-"));
  const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  try {
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-subj", "/CN=Jev test CA", "-days", "1");
    for (const name of ["t.me", "wrong.example"]) {
      openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${name}`);
      await Bun.write(join(dir, "ext.cnf"), `subjectAltName=DNS:${name}
basicConstraints=CA:FALSE
extendedKeyUsage=serverAuth
`);
      openssl("x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.pem`, "-days", "1", "-extfile", "ext.cnf");
    }
    type Transport = NonNullable<Parameters<typeof requestPublicTelegramPage>[2]>;
    for (const mode of ["valid", "wrong-host", "untrusted"] as const) {
      const name = mode === "wrong-host" ? "wrong.example" : "t.me";
      let hits = 0, pins = 0;
      const server = createServer({ key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.pem`)) }, (req, res) => {
        hits++;
        expect(req.headers.host).toBe("t.me");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<div class="tgme_page_title">TLS fixture</div>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      try {
        const port = (server.address() as { port: number }).port;
        const transport: Transport = {
          lookup: (async () => [{ address: "149.154.167.99", family: 4 }]) as unknown as Transport["lookup"],
          request: ((url, options, callback) => request(url, {
            ...options, port,
            ...(mode !== "untrusted" ? { ca: readFileSync(join(dir, "ca.pem")) } : {}),
            lookup: (host, opts, cb) => {
              // Exercise the production pin callback before substituting ONLY
              // the test socket destination. Bun 1.3 uses the all-address form.
              options.lookup!(host, { ...opts, all: true }, (error, addresses) => {
                expect(error).toBeNull();
                expect(addresses).toEqual([{ address: "149.154.167.99", family: 4 }]);
                pins++;
                if (opts.all) cb(null, [{ address: "127.0.0.1", family: 4 }]);
                else cb(null, "127.0.0.1", 4);
              });
            },
          }, callback)) as Transport["request"],
        };
        const result = requestPublicTelegramPage("https://t.me/test", AbortSignal.timeout(1500), transport);
        if (mode === "valid") {
          expect((await result).status).toBe(200);
          expect(hits).toBe(1);
        } else {
          await expect(result).rejects.toThrow();
          expect(hits).toBe(0);
        }
        expect(pins).toBe(1);
      } finally {
        // Bun closeAllConnections stops its listener too; do not close twice.
        server.closeAllConnections();
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15_000);
