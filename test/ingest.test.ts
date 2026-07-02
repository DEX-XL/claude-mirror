import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ingest } from "../src/ingest/parser.js";
import { normalizeRecord } from "../src/ingest/parser.js";
import { extractUserText, stripWrappers } from "../src/ingest/text.js";
import { projectBasename } from "../src/ingest/accessors.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("text isolation", () => {
  it("keeps genuine typed text", () => {
    expect(extractUserText([{ type: "text", text: "hello world" }])).toBe("hello world");
  });
  it("strips wrapper tags", () => {
    const raw = "<ide_selection>lines</ide_selection>\n<system-reminder>ctx</system-reminder> real text";
    expect(stripWrappers(raw)).toBe("real text");
  });
  it("drops records that are only wrappers", () => {
    expect(extractUserText([{ type: "text", text: "<command-name>/init</command-name>" }])).toBeUndefined();
  });
  it("strips harness task-notification and ide_opened_file blocks", () => {
    const raw = "<task-notification>\n<task-id>abc</task-id>\n<status>done</status>\n</task-notification>\nnow continue the work";
    expect(stripWrappers(raw)).toBe("now continue the work");
    expect(extractUserText([{ type: "text", text: "<ide_opened_file>foo.ts</ide_opened_file>" }])).toBeUndefined();
  });
  it("ignores tool_result / image blocks", () => {
    expect(extractUserText([{ type: "tool_result", content: "x" }])).toBeUndefined();
    expect(extractUserText([{ type: "image" }, { type: "text", text: "with caption here" }])).toBe(
      "with caption here"
    );
  });
});

describe("normalizeRecord", () => {
  it("emits a user_prompt for a typed message", () => {
    const { events, recognized } = normalizeRecord(
      {
        type: "user",
        promptSource: "typed",
        message: { content: [{ type: "text", text: "do the thing" }] },
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionId: "s",
      },
      "C--Users-x-myproj"
    );
    expect(recognized).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "user_prompt", text: "do the thing", project: "myproj" });
  });
  it("does NOT emit text for tool-result user records", () => {
    const { events } = normalizeRecord(
      {
        type: "user",
        message: { content: [{ type: "tool_result", content: "out" }] },
        toolUseResult: { ok: true },
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionId: "s",
      },
      "proj"
    );
    expect(events).toHaveLength(0);
  });
  it("emits assistant_turn + tool_call from assistant content", () => {
    const { events } = normalizeRecord(
      {
        type: "assistant",
        message: {
          model: "claude-opus-4-8",
          content: [{ type: "tool_use", name: "Edit" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionId: "s",
      },
      "proj"
    );
    expect(events.map((e) => e.kind)).toEqual(["assistant_turn", "tool_call"]);
    expect(events[0].tokens).toMatchObject({ in: 10, out: 5 });
    expect(events[1].toolName).toBe("Edit");
  });
  it("marks unknown record types as not-recognized without throwing", () => {
    const { events, recognized } = normalizeRecord({ type: "queue-operation" }, "proj");
    expect(recognized).toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe("projectBasename", () => {
  it("anonymizes to the last path segment", () => {
    expect(projectBasename("C--Users-rohit-OneDrive-Cheesecake-BrainApp")).toBe("BrainApp");
    expect(projectBasename("")).toBe("unknown");
  });
});

describe("ingest against fixtures", () => {
  it("parses the whole fixtures dir without crashing", async () => {
    const res = await ingest(FIX);
    expect(res.files).toBeGreaterThan(0);
    expect(res.events.length).toBeGreaterThan(0);
    // malformed.jsonl has 2 broken lines
    expect(res.malformed).toBeGreaterThanOrEqual(2);
    // events must be chronologically sorted
    for (let i = 1; i < res.events.length; i++) {
      expect(res.events[i].ts).toBeGreaterThanOrEqual(res.events[i - 1].ts);
    }
    // no user_prompt should contain a raw wrapper tag
    for (const e of res.events) {
      if (e.text) expect(e.text).not.toMatch(/<ide_selection|<system-reminder|<command-name/);
    }
  });
  it("handles the giant single line", async () => {
    const res = await ingest(FIX);
    const giant = res.events.find((e) => e.text?.startsWith("giant prompt:"));
    expect(giant).toBeTruthy();
  });
});
