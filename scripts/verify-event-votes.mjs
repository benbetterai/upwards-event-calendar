#!/usr/bin/env node
/**
 * Smoke-test event_votes via Supabase REST using the anon key embedded in index.html.
 * Run from repo root: node scripts/verify-event-votes.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const urlMatch = html.match(/const SUPABASE_URL = "([^"]+)"/);
const keyMatch =
  html.match(/const SUPABASE_KEY\s*=\s*\n\s*"([^"]+)"/) ||
  html.match(/const SUPABASE_KEY = "([^"]+)"/);

if (!urlMatch || !keyMatch) {
  console.error("Could not parse SUPABASE_URL / SUPABASE_KEY from index.html");
  process.exit(1);
}

const base = urlMatch[1].replace(/\/$/, "");
const key = keyMatch[1];
const rest = `${base}/rest/v1/event_votes`;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const member = "__node_verify__";
const eventId = 999002;

async function main() {
  const del = await fetch(`${rest}?event_id=eq.${eventId}&member_name=eq.${member}`, {
    method: "DELETE",
    headers,
  });
  if (!del.ok && del.status !== 406) {
    console.error("cleanup delete failed", del.status, await del.text());
    process.exit(1);
  }

  const ins = await fetch(rest, {
    method: "POST",
    headers,
    body: JSON.stringify([
      { event_id: eventId, member_name: member, vote_type: "up" },
    ]),
  });
  if (!ins.ok) {
    console.error("insert failed", ins.status, await ins.text());
    process.exit(1);
  }

  const sel = await fetch(
    `${rest}?event_id=eq.${eventId}&member_name=eq.${member}&select=event_id,vote_type`,
    { headers },
  );
  if (!sel.ok) {
    console.error("select failed", sel.status, await sel.text());
    process.exit(1);
  }
  const rows = await sel.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].vote_type !== "up") {
    console.error("unexpected select rows", rows);
    process.exit(1);
  }

  const patch = await fetch(`${rest}?event_id=eq.${eventId}&member_name=eq.${member}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ vote_type: "down" }),
  });
  if (!patch.ok) {
    console.error("patch failed", patch.status, await patch.text());
    process.exit(1);
  }

  const del2 = await fetch(`${rest}?event_id=eq.${eventId}&member_name=eq.${member}`, {
    method: "DELETE",
    headers,
  });
  if (!del2.ok) {
    console.error("final delete failed", del2.status, await del2.text());
    process.exit(1);
  }

  console.log("OK: event_votes anon REST insert → select → patch → delete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
