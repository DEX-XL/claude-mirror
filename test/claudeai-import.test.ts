import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importClaudeAiExport } from "../src/ingest/claudeai-import.js";

const SAMPLE = {
  conversations: [
    {
      uuid: "conv-1",
      created_at: "2026-06-01T10:00:00.000Z",
      chat_messages: [
        {
          uuid: "m1",
          sender: "human",
          created_at: "2026-06-01T10:00:00.000Z",
          text: "make this easier for regular users",
        },
        {
          uuid: "m2",
          sender: "assistant",
          created_at: "2026-06-01T10:00:01.000Z",
          model: "claude-opus-4-8",
          content: [{ type: "text", text: "use the export file directly" }],
        },
      ],
    },
  ],
};

describe("claude.ai import", () => {
  it("imports a plain conversations JSON file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-mirror-"));
    const jsonPath = join(dir, "conversations.json");
    await writeFile(jsonPath, JSON.stringify(SAMPLE), "utf8");

    const result = await importClaudeAiExport(jsonPath);

    expect(result.events.map((event) => event.kind)).toEqual(["user_prompt", "assistant_turn"]);
    expect(result.events[0].text).toContain("regular users");
    expect(result.parsed).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  });

  it("imports the same payload from a zip archive", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-mirror-"));
    const zipPath = join(dir, "export.zip");
    const zip = new AdmZip();
    zip.addFile("conversations.json", Buffer.from(JSON.stringify(SAMPLE), "utf8"));
    zip.writeZip(zipPath);

    const result = await importClaudeAiExport(zipPath);

    expect(result.events).toHaveLength(2);
    expect(result.events[1].model).toBe("claude-opus-4-8");
  });
});