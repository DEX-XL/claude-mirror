import { describe, it, expect } from "vitest";
import { redact } from "../src/persona/redact.js";

describe("redaction pipeline (planted secrets)", () => {
  it("strips emails", () => {
    const out = redact("mail me at rohit.motwani222@gmail.com ok");
    expect(out).not.toContain("gmail.com");
    expect(out).toContain("[REDACTED_EMAIL]");
  });
  it("strips OpenAI-style keys", () => {
    const out = redact("key is sk-abcdef1234567890ABCDEFdone");
    expect(out).toContain("[REDACTED_KEY]");
    expect(out).not.toContain("abcdef1234567890");
  });
  it("strips GitHub tokens", () => {
    const out = redact("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expect(out).toContain("[REDACTED_KEY]");
  });
  it("strips JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redact("token " + jwt);
    expect(out).toContain("[REDACTED_KEY]");
    expect(out).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV");
  });
  it("strips query params from URLs but keeps host", () => {
    const out = redact("see https://example.com/path?token=secret123&x=1 now");
    expect(out).not.toContain("secret123");
    expect(out).toContain("example.com");
  });
  it("reduces absolute paths to basenames", () => {
    const win = redact("open C:\\Users\\rohit\\secret\\config.json please");
    expect(win).not.toContain("rohit");
    expect(win).toContain("config.json");
    const posix = redact("cat /home/rohit/private/keys.txt");
    expect(posix).not.toContain("/home/rohit/private");
    expect(posix).toContain("keys.txt");
  });
  it("leaves ordinary prose alone", () => {
    const text = "please refactor the login form and add tests";
    expect(redact(text)).toBe(text);
  });
});
