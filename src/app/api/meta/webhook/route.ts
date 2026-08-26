import { parseInstagramWebhook, hasValidMetaSignature } from "@/lib/meta/webhook";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

async function resolveCommentIdentity(
  admin: AdminClient,
  event: { username: string; participantCode: string; mediaId: string },
) {
  const { data: profileId, error: profileError } = await admin.rpc("resolve_participant_login", {
    p_username: event.username,
  });
  if (profileError || !profileId) return event.username;

  const [{ data: profile }, { data: participations }] = await Promise.all([
    admin.from("profiles").select("instagram_username_normalized").eq("id", profileId).maybeSingle(),
    admin.from("participations")
      .select("draw_id")
      .eq("profile_id", profileId)
      .eq("participant_code", event.participantCode)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const drawIds = [...new Set((participations ?? []).map((item) => item.draw_id))];
  if (drawIds.length > 0) {
    const { data: draws } = await admin.from("draws")
      .select("id, edition_number, instagram_media_id")
      .in("id", drawIds)
      .eq("status", "open")
      .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`)
      .order("edition_number", { ascending: false })
      .limit(1);
    const draw = draws?.[0];
    if (draw && !draw.instagram_media_id) {
      const { error: linkError } = await admin.from("draws")
        .update({ instagram_media_id: event.mediaId })
        .eq("id", draw.id)
        .is("instagram_media_id", null);
      if (linkError) throw linkError;
    }
  }

  return profile?.instagram_username_normalized || event.username;
}

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
      // El login admite el usuario actual y sus nombres anteriores. Usamos esa
      // misma identidad para que un cambio de @ no rompa la verificacion social.
      // El primer comentario valido tambien vincula de forma segura la publicacion
      // con el sorteo abierto mediante perfil + codigo unico de participacion.
      const matchedUsername = await resolveCommentIdentity(admin, event);
      const { error } = await admin.rpc("record_instagram_comment", {
        p_external_id: event.externalId,
        p_instagram_user_id: event.instagramUserId,
        p_instagram_username: matchedUsername,
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

