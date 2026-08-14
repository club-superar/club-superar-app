export type InstagramCommentEvent = {
  kind: "comment";
  externalId: string;
  instagramUserId: string;
  username: string;
  mediaId: string;
  text: string;
  participantCode: string;
  mentions: string[];
};

export type InstagramStoryMentionEvent = {
  kind: "story_mention";
  externalId: string;
  instagramUserId: string;
  username: string;
  storyUrl: string;
};

export type InstagramWebhookEvent = InstagramCommentEvent | InstagramStoryMentionEvent;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function extractParticipantCode(text: string) {
  return text.toUpperCase().match(/(?:^|[^A-Z0-9])(SUPER-[A-Z0-9]{4,10})(?=$|[^A-Z0-9])/u)?.[1] ?? "";
}

export function extractMentions(text: string) {
  return [...new Set([...text.toLowerCase().matchAll(/(?:^|[^a-z0-9._])@([a-z0-9._]{1,30})/gu)].map((match) => match[1]))];
}

export function parseInstagramWebhook(payload: unknown): InstagramWebhookEvent[] {
  const events: InstagramWebhookEvent[] = [];
  const entries = Array.isArray(record(payload).entry) ? record(payload).entry as unknown[] : [];

  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const changes = Array.isArray(entry.changes) ? entry.changes as unknown[] : [];
    for (const rawChange of changes) {
      const change = record(rawChange);
      if (string(change.field) !== "comments") continue;
      const value = record(change.value);
      const from = record(value.from);
      const media = record(value.media);
      const text = string(value.text);
      const externalId = string(value.id);
      const participantCode = extractParticipantCode(text);
      if (!externalId || !participantCode) continue;
      events.push({
        kind: "comment",
        externalId,
        instagramUserId: string(from.id),
        username: normalizeUsername(string(from.username)),
        mediaId: string(media.id),
        text,
        participantCode,
        mentions: extractMentions(text),
      });
    }

    const messaging = Array.isArray(entry.messaging) ? entry.messaging as unknown[] : [];
    for (const rawMessageEvent of messaging) {
      const messageEvent = record(rawMessageEvent);
      const sender = record(messageEvent.sender);
      const message = record(messageEvent.message);
      const attachments = Array.isArray(message.attachments) ? message.attachments as unknown[] : [];
      for (const rawAttachment of attachments) {
        const attachment = record(rawAttachment);
        if (string(attachment.type) !== "story_mention") continue;
        const attachmentPayload = record(attachment.payload);
        const externalId = string(message.mid);
        if (!externalId) continue;
        events.push({
          kind: "story_mention",
          externalId,
          instagramUserId: string(sender.id),
          username: normalizeUsername(string(sender.username)),
          storyUrl: string(attachmentPayload.url),
        });
      }
    }
  }
  return events;
}

export async function hasValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const expected = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.min(actual.length, expected.length); index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
