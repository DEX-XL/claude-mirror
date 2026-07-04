import { createServer } from "node:http";
import type { Profile } from "./types.js";
import { renderReport } from "./render/template.js";
import { brainPage, dashboardPage, connectPage } from "./render/app.js";
import { buildMirrorPersona } from "./persona/mirror.js";
import { detectBackend, runModel, type LlmBackend } from "./persona/runner.js";

// The local web app: serves the live dashboard (report + working chat) on
// 127.0.0.1 only. No telemetry, no external calls except the user's own
// model backend for chat turns.

export type ServeOptions = {
  port?: number;
  onReady?: (url: string) => void;
  log?: (line: string) => void;
  /** Re-ingest and recompute the profile (persona preserved by the caller). */
  rebuild?: () => Promise<Profile>;
  /** Which data sources fed this profile (drives the Connect page). */
  sources?: { localDetected: boolean; imported: string[] };
};

type ChatMsg = { role: "user" | "mirror"; text: string };

function transcript(messages: ChatMsg[]): string {
  return messages
    .map((m) => (m.role === "user" ? `Them: ${m.text}` : `You (Mirror): ${m.text}`))
    .join("\n");
}

export async function serve(profile: Profile, opts: ServeOptions = {}): Promise<void> {
  const port = opts.port ?? 3737;
  const log = opts.log ?? (() => {});
  const sources = opts.sources ?? { localDetected: true, imported: [] };
  let persona = buildMirrorPersona(profile);
  let backend: LlmBackend = await detectBackend();
  let current = profile;
  let pages = renderPages(current);
  function renderPages(p: Profile) {
    return {
      "/": brainPage(p),
      "/dashboard": dashboardPage(p),
      "/story": renderReport(p, { live: true }),
      "/connect": connectPage(p, sources),
    } as Record<string, string>;
  }

  const server = createServer(async (req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    const path = (req.url ?? "/").split("?")[0].replace(/\/$/, "") || "/";
    const page = path === "/index.html" ? pages["/"] : pages[path];
    if (req.method === "GET" && page) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    if (req.method === "GET" && req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json", ...cors });
      return res.end(JSON.stringify({ ok: true, backend }));
    }
    if (req.method === "GET" && req.url === "/api/profile") {
      res.writeHead(200, { "content-type": "application/json", ...cors });
      return res.end(JSON.stringify(current));
    }
    if (req.method === "POST" && req.url === "/api/refresh") {
      if (!opts.rebuild) {
        res.writeHead(501, { "content-type": "application/json", ...cors });
        return res.end(JSON.stringify({ error: "refresh not available" }));
      }
      try {
        current = await opts.rebuild();
        persona = buildMirrorPersona(current);
        pages = renderPages(current);
        log("refreshed data");
        res.writeHead(200, { "content-type": "application/json", ...cors });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json", ...cors });
        return res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
    }
    if (req.method === "POST" && req.url === "/api/chat") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { messages } = JSON.parse(body) as { messages: ChatMsg[] };
          if (!Array.isArray(messages) || messages.length === 0) throw new Error("no messages");
          if (backend === "none") backend = await detectBackend();
          if (backend === "none") {
            res.writeHead(503, { "content-type": "application/json", ...cors });
            return res.end(
              JSON.stringify({ error: "No Claude CLI or ANTHROPIC_API_KEY available for chat." })
            );
          }
          const user =
            `Conversation so far:\n${transcript(messages.slice(-20))}\n\n` +
            `Reply as the Mirror. Output ONLY your reply text.`;
          const reply = (await runModel(backend, persona, user, { model: "sonnet" })).trim();
          log(`chat: ${messages[messages.length - 1].text.slice(0, 60)}`);
          res.writeHead(200, { "content-type": "application/json", ...cors });
          res.end(JSON.stringify({ reply }));
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json", ...cors });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
      return;
    }
    res.writeHead(404, cors);
    res.end("not found");
  });

  await new Promise<void>((resolveReady, rejectReady) => {
    server.on("error", rejectReady);
    server.listen(port, "127.0.0.1", () => {
      opts.onReady?.(`http://localhost:${port}`);
      resolveReady();
    });
  });
  // Keep process alive; caller owns lifecycle (Ctrl+C).
}
