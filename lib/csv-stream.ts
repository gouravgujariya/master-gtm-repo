// Streaming CSV reader — for the huge bulk files (1.5GB) we can't load into memory.
// Emits one row object at a time; return false from onRow to stop early (closes the stream).
// Handles quoted fields with embedded commas/newlines/escaped quotes.

import { createReadStream } from "node:fs";

export function streamCsv(
  path: string,
  onRow: (row: Record<string, string>, index: number) => boolean | void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path, { encoding: "utf8" });
    let header: string[] | null = null;
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    let pendingQuote = false; // a '"' seen at the very end of a chunk (could be escape or close)
    let idx = 0;
    let stopped = false;

    const pushField = () => { row.push(field); field = ""; };
    const pushRow = () => {
      pushField();
      if (!header) { header = row.map((h) => h.trim()); row = []; return; }
      const obj: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = row[i] ?? "";
      row = [];
      if (onRow(obj, idx++) === false) { stopped = true; stream.destroy(); }
    };

    stream.on("data", (data: string | Buffer) => {
      if (stopped) return;
      const chunk = typeof data === "string" ? data : data.toString("utf8");
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (pendingQuote) {
          pendingQuote = false;
          if (c === '"') { field += '"'; continue; } // escaped quote
          inQuotes = false; // it was a closing quote; fall through to handle c normally
        }
        if (inQuotes) {
          if (c === '"') {
            if (i === chunk.length - 1) { pendingQuote = true; }
            else if (chunk[i + 1] === '"') { field += '"'; i++; }
            else inQuotes = false;
          } else field += c;
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ",") pushField();
          else if (c === "\n") { pushRow(); if (stopped) return; }
          else if (c === "\r") { /* skip */ }
          else field += c;
        }
      }
    });
    stream.on("close", () => { if (!stopped && (field.length || row.length)) pushRow(); resolve(); });
    stream.on("error", (e) => { if (stopped) resolve(); else reject(e); });
  });
}
