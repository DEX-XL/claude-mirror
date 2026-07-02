// User-text isolation. This decides what counts as genuine user-authored
// prompt text. Getting this wrong leaks tool output / assistant text into
// the persona engine, so it is deliberately conservative.

const WRAPPER_TAGS = [
  "ide_selection",
  "ide_opened_file",
  "system-reminder",
  "command-name",
  "command-message",
  "command-args",
  "local-command-stdout",
  "local-command-stderr",
  "user-prompt-submit-hook",
  // Harness-injected task lifecycle notifications (wrap task-id/output-file/etc).
  "task-notification",
];

/**
 * Strip harness/command wrapper blocks that arrive inside a user record but
 * were NOT typed by the human. Returns the remaining human text, trimmed.
 */
export function stripWrappers(raw: string): string {
  let out = raw;
  for (const tag of WRAPPER_TAGS) {
    // Remove <tag>...</tag> (including multiline) and any stray self-closing.
    const paired = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    const solo = new RegExp(`<\\/?${tag}[^>]*>`, "gi");
    out = out.replace(paired, " ").replace(solo, " ");
  }
  return out.replace(/\s+\n/g, "\n").trim();
}

/**
 * Extract genuine user text from a `user` record's message.content.
 * content may be a string or an array of blocks. We take only `text` blocks,
 * skip tool_result/image/document blocks, then strip wrappers.
 * Returns undefined if nothing human remains.
 */
export function extractUserText(content: unknown): string | undefined {
  let raw = "";
  if (typeof content === "string") {
    raw = content;
  } else if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object" && !Array.isArray(block)) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
      }
    }
    raw = texts.join("\n");
  } else {
    return undefined;
  }
  const cleaned = stripWrappers(raw);
  return cleaned.length > 0 ? cleaned : undefined;
}
