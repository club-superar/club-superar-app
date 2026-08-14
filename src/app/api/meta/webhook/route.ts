import { parseInstagramWebhook, hasValidMetaSignature } from "@/lib/meta/webhook";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response("Verificacion rechazada", { status: 403 });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return new Response("Payload demasiado grande", { status: 413 });

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return new Response("Payload demasiado grande", { status: 413 });
  }

  const appSecret = process.env.META_APP_SECRET ?? "";
  const validSignature = await hasValidMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret);
  if (!validSignature) return new Response("Firma invalida", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("JSON invalido", { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const events = parseInstagramWebhook(payload);
  for (const event of events) {
    if (event.kind === "comment") {
      const { error } = await admin.rpc("record_instagram_comment", {
        p_external_id: event.externalId,
        p_instagram_user_id: event.instagramUserId,
        p_instagram_username: event.username,
        p_instagram_media_id: event.mediaId,
        p_participant_code: event.participantCode,
        p_mentions: event.mentions,
        p_evidence: { comment_id: event.externalId, media_id: event.mediaId, text: event.text.slice(0, 500), mentions: event.mentions },
      });
      if (error) return new Response("No se pudo procesar el comentario", { status: 500 });
    } else {
      const { error } = await admin.rpc("record_instagram_story_mention", {
        p_external_id: event.externalId,
        p_instagram_user_id: event.instagramUserId,
        p_instagram_username: event.username || null,
        p_evidence: { message_id: event.externalId, story_url: event.storyUrl },
      });
      if (error) return new Response("No se pudo procesar la mencion", { status: 500 });
    }
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}
