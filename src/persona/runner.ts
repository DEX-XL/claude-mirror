import { spawn } from "node:child_process";

export type LlmBackend = "claude-cli" | "api" | "none";

export type RunnerOptions = {
  model?: string; // e.g. "sonnet"
  timeoutMs?: number;
};

/** Detect which backend is available, in priority order. */
export async function detectBackend(): Promise<LlmBackend> {
  if (await claudeCliAvailable()) return "claude-cli";
  if (process.env.ANTHROPIC_API_KEY) return "api";
  return "none";
}

function claudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["--version"], { shell: process.platform === "win32" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Pull the first balanced JSON object out of arbitrary model text
 * (handles ```json fences and leading/trailing prose).
 */
export function extractJson(text: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return candidate.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function runClaudeCli(
  system: string,
  user: string,
  opts: RunnerOptions
): Promise<string> {
  // The prompt can be ~50KB — far past the OS argv length limit (Windows in
  // particular). So we pass NOTHING large as an argument: the whole prompt
  // (system rubric + user text) goes over stdin, and argv holds only short,
  // shell-safe flags.
  const args = ["-p", "--output-format", "json"];
  if (opts.model) args.push("--model", opts.model);
  const combined = `${system}\n\n---\n\n${user}`;

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      shell: process.platform === "win32", // needed to resolve claude.cmd on Windows
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("claude CLI timed out"));
    }, opts.timeoutMs ?? 180_000);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude CLI exited ${code}: ${err}`));
      // --output-format json wraps the reply: { result: "...", ... }
      try {
        const env = JSON.parse(out);
        resolve(typeof env.result === "string" ? env.result : out);
      } catch {
        resolve(out);
      }
    });

    child.stdin.on("error", () => {}); // ignore EPIPE if the child exits early
    child.stdin.write(combined);
    child.stdin.end();
  });
}

async function runApi(
  system: string,
  user: string,
  opts: RunnerOptions
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const model = opts.model === "sonnet" || !opts.model ? "claude-sonnet-5" : opts.model;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const block = Array.isArray(data.content)
    ? data.content.find((b: any) => b.type === "text")
    : null;
  return block?.text ?? "";
}

/** Run one prompt through the chosen backend and return raw model text. */
export async function runModel(
  backend: LlmBackend,
  system: string,
  user: string,
  opts: RunnerOptions = {}
): Promise<string> {
  if (backend === "claude-cli") return runClaudeCli(system, user, opts);
  if (backend === "api") return runApi(system, user, opts);
  throw new Error("no LLM backend available");
}
