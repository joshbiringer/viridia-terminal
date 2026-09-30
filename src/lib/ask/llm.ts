/**
 * Optional language-model layer for Ask Viridia. Off unless ANTHROPIC_API_KEY is set; when on, it
 * only writes the short interpretation paragraph over evidence Viridia already retrieved, and the
 * engine rejects the paragraph if it contains a number that isn't in that evidence.
 */
import type { Llm } from "./engine";

export function getLlm(): Llm | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ASK_VIRIDIA_MODEL || "claude-sonnet-5";
  return {
    model,
    async stream(system, user, onDelta) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 400, temperature: 0.2, system, stream: true, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok || !res.body) throw new Error(`model request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "", tokensIn = 0, tokensOut = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.startsWith("data:")) continue;
          try {
            const e = JSON.parse(l.slice(5).trim());
            if (e.type === "content_block_delta" && e.delta?.type === "text_delta") { text += e.delta.text; onDelta(e.delta.text); }
            if (e.type === "message_start") tokensIn = e.message?.usage?.input_tokens ?? 0;
            if (e.type === "message_delta") tokensOut = e.usage?.output_tokens ?? tokensOut;
          } catch { /* partial line */ }
        }
      }
      return { text, tokensIn, tokensOut };
    },
  };
}
