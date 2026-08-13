"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireAdminUserId } from "@/lib/auth/admin";
import { createAdminSessionSupabaseClient } from "@/lib/supabase/server";

export type AdminActionState = { error?: string; success?: string };

export async function loginAdmin(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const email = String(formData.get("email") ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return { error: "Revisa el correo y la contrasena." };
  }

  const supabase = await createAdminSessionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.status === 429) return { error: "Supabase bloqueo temporalmente nuevos intentos. Espera unos minutos." };
    return { error: `Supabase rechazo el acceso (codigo: ${error?.code ?? "sin_codigo"}).` };
  }

  const admin = createAdminSupabaseClient();
  const { data: allowed, error: roleError } = await admin.rpc("is_phase1_admin", {
    p_user_id: data.user.id,
  });
  if (roleError || !allowed) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene permiso de administracion." };
  }
  redirect("/admin");
}

export async function logoutAdmin() {
  const supabase = await createAdminSessionSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/ingresar");
}

export async function setAdminPassword(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const password = String(formData.get("password") ?? "");
  const repeatPassword = String(formData.get("repeatPassword") ?? "");
  if (password.length < 12) return { error: "La contrasena debe tener al menos 12 caracteres." };
  if (password !== repeatPassword) return { error: "Las dos contrasenas no coinciden." };

  const supabase = await createAdminSessionSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { error: "El enlace vencio. Solicita uno nuevo." };

  const admin = createAdminSupabaseClient();
  const { data: allowed } = await admin.rpc("is_phase1_admin", {
    p_user_id: claimsData.claims.sub,
  });
  if (!allowed) return { error: "Esta cuenta no tiene permiso de administracion." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No pudimos guardar la contrasena. Proba con otra mas segura." };
  redirect("/admin");
}

function argentinaDateTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createDraw(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const title = String(formData.get("title") ?? "").trim();
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const prizeValueText = String(formData.get("prizeValue") ?? "").trim();
  const prizeValue = prizeValueText === "" ? null : Number(prizeValueText);
  const opensAt = argentinaDateTimeToIso(String(formData.get("opensAt") ?? ""));
  const closesAt = argentinaDateTimeToIso(String(formData.get("closesAt") ?? ""));
  const instagramProfileUrl = String(formData.get("instagramProfileUrl") ?? "").trim();
  const whatsappGroupUrl = String(formData.get("whatsappGroupUrl") ?? "").trim();
  const mainPublicationUrl = String(formData.get("mainPublicationUrl") ?? "").trim();
  const readInteger = (name: string) => Number(String(formData.get(name) ?? ""));
  const rules = {
    follow_instagram: 0,
    whatsapp_group: 0,
    comment_and_tag: 0,
    share_story: 0,
    completion_bonus: 0,
    extra_action: 0,
    max_extra_actions: readInteger("maxExtraChances"),
  };
  const maxBaseChances = readInteger("maxBaseChances");
  const maxExtraChances = readInteger("maxExtraChances");
  const winnerPercent = readInteger("winnerPercent");
  const claimHours = readInteger("claimHours");

  if (title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Completa el nombre, el premio y las dos fechas." };
  }
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) {
    return { error: "El valor del premio no es valido." };
  }
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  if (!Object.values(rules).every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
    || !Number.isInteger(maxBaseChances) || maxBaseChances < 2 || maxBaseChances > 6
    || !Number.isInteger(maxExtraChances) || maxExtraChances < 0 || maxExtraChances > 2
    || !Number.isInteger(winnerPercent) || winnerPercent < 0 || winnerPercent > 100
    || !Number.isInteger(claimHours) || claimHours < 1 || claimHours > 168) {
    return { error: "Revisá las reglas, los puntos y los límites del sorteo." };
  }

  const admin = createAdminSupabaseClient();
  const { data: created, error } = await admin.rpc("admin_create_draw", {
    p_actor_id: actorId,
    p_title: title,
    p_prize_name: prizeName,
    p_prize_value: prizeValue,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_instagram_profile_url: instagramProfileUrl,
    p_whatsapp_group_url: whatsappGroupUrl,
    p_main_publication_url: mainPublicationUrl,
  });
  if (error) return { error: "No pudimos crear el sorteo. Revisa los datos y las fechas." };

  const drawId = (created as { id?: number } | null)?.id;
  if (!drawId) return { error: "El sorteo se creó, pero no pudimos recuperar su configuración." };
  const { error: drawRulesError } = await admin.from("draws").update({
    claim_window_hours: claimHours,
    winner_retained_chance_percent: winnerPercent,
    max_base_chances: maxBaseChances,
    max_extra_chances: maxExtraChances,
    points_config: rules,
  }).eq("id", drawId).eq("status", "draft");
  const requirementUpdates = await Promise.all([
    ["follow_instagram", rules.follow_instagram],
    ["whatsapp_group", rules.whatsapp_group],
    ["comment_and_tag", rules.comment_and_tag],
    ["share_story", rules.share_story],
  ].map(([requirementKey, points]) => admin.from("draw_requirements").update({ points }).eq("draw_id", drawId).eq("requirement_key", requirementKey)));
  if (drawRulesError || requirementUpdates.some((result) => result.error)) {
    await admin.from("draws").delete().eq("id", drawId).eq("status", "draft");
    return { error: "No pudimos guardar todas las reglas. El borrador incompleto fue descartado." };
  }

  revalidatePath("/admin");
  return { success: "Sorteo guardado como borrador." };
}

export async function updateDraftDraw(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  const title = String(formData.get("title") ?? "").trim();
  const prizeName = String(formData.get("prizeName") ?? "").trim();
  const prizeValueText = String(formData.get("prizeValue") ?? "").trim();
  const prizeValue = prizeValueText === "" ? null : Number(prizeValueText);
  const opensAt = argentinaDateTimeToIso(String(formData.get("opensAt") ?? ""));
  const closesAt = argentinaDateTimeToIso(String(formData.get("closesAt") ?? ""));
  const instagramProfileUrl = String(formData.get("instagramProfileUrl") ?? "").trim();
  const whatsappGroupUrl = String(formData.get("whatsappGroupUrl") ?? "").trim();
  const mainPublicationUrl = String(formData.get("mainPublicationUrl") ?? "").trim();
  const integer = (name: string) => Number(String(formData.get(name) ?? ""));
  const values = {
    followPoints: 0, whatsappPoints: 0,
    commentPoints: 0, storyPoints: 0,
    completionPoints: 0, extraActionPoints: 0,
    maxBaseChances: integer("maxBaseChances"), maxExtraChances: integer("maxExtraChances"),
    winnerPercent: integer("winnerPercent"), claimHours: integer("claimHours"),
  };

  if (!Number.isSafeInteger(drawId) || drawId <= 0 || title.length < 3 || prizeName.length < 3 || !opensAt || !closesAt) {
    return { error: "Revisá el nombre, el premio y las fechas." };
  }
  if (new Date(closesAt) <= new Date(opensAt)) return { error: "El cierre debe ser posterior a la apertura." };
  if (prizeValue !== null && (!Number.isFinite(prizeValue) || prizeValue < 0)) return { error: "El valor del premio no es válido." };
  if (![instagramProfileUrl, whatsappGroupUrl, mainPublicationUrl].every((url) => /^https:\/\//.test(url))) {
    return { error: "Los tres enlaces deben comenzar con https://" };
  }
  if (!Number.isInteger(values.maxBaseChances) || values.maxBaseChances < 2 || values.maxBaseChances > 6
    || !Number.isInteger(values.maxExtraChances) || values.maxExtraChances < 0 || values.maxExtraChances > 2
    || !Number.isInteger(values.winnerPercent) || values.winnerPercent < 0 || values.winnerPercent > 100
    || !Number.isInteger(values.claimHours) || values.claimHours < 1 || values.claimHours > 168) {
    return { error: "Revisá los puntos y los límites del sorteo." };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_update_draft_draw", {
    p_actor_id: actorId, p_draw_id: drawId, p_title: title, p_prize_name: prizeName,
    p_prize_value: prizeValue, p_opens_at: opensAt, p_closes_at: closesAt,
    p_instagram_profile_url: instagramProfileUrl, p_whatsapp_group_url: whatsappGroupUrl,
    p_main_publication_url: mainPublicationUrl, p_follow_points: values.followPoints,
    p_whatsapp_points: values.whatsappPoints, p_comment_points: values.commentPoints,
    p_story_points: values.storyPoints, p_completion_points: values.completionPoints,
    p_extra_action_points: values.extraActionPoints, p_max_base_chances: values.maxBaseChances,
    p_max_extra_chances: values.maxExtraChances, p_winner_percent: values.winnerPercent,
    p_claim_hours: values.claimHours,
  });
  if (error) {
    if (error.message.includes("DRAW_NOT_DRAFT")) return { error: "Este sorteo ya fue abierto y sus reglas están congeladas." };
    return { error: "No pudimos guardar los cambios. Revisá los datos." };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
  revalidatePath("/");
  return { success: "Cambios guardados correctamente." };
}

export async function openDraw(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_open_draw", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) throw new Error("No pudimos abrir este sorteo.");
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function reviewRequirement(formData: FormData) {
  const actorId = await requireAdminUserId();
  const completionId = Number(formData.get("completionId"));
  const drawId = Number(formData.get("drawId"));
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isSafeInteger(completionId) || completionId <= 0) return;
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;
  if (!new Set(["verified", "rejected"]).has(decision)) return;
  if (decision === "rejected" && reason.length < 3) throw new Error("Escribi el motivo del rechazo.");

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_review_requirement", {
    p_actor_id: actorId,
    p_completion_id: completionId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) throw new Error("No pudimos guardar la revision.");
  revalidatePath(`/admin/sorteos/${drawId}`);
  revalidatePath("/");
  revalidatePath("/perfil");
}

export async function freezeDraw(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_freeze_draw", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) {
    if (error.message.includes("NO_ELIGIBLE_PARTICIPANTS")) throw new Error("No hay participantes completos para congelar.");
    throw new Error("No pudimos cerrar este sorteo.");
  }
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
}

export async function selectProvisionalWinner(formData: FormData) {
  const actorId = await requireAdminUserId();
  const drawId = Number(formData.get("drawId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("admin_select_provisional_winner", {
    p_actor_id: actorId,
    p_draw_id: drawId,
  });
  if (error) {
    if (error.message.includes("UNRESOLVED_ATTEMPT")) throw new Error("Ya hay un ganador provisional pendiente de revision.");
    if (error.message.includes("NO_CANDIDATES_LEFT")) throw new Error("No quedan participantes habilitados.");
    throw new Error("No pudimos realizar el sorteo.");
  }

  const attempt = data as { id?: number } | null;
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${drawId}`);
  redirect(`/admin/sorteos/${drawId}?reveal=${attempt?.id ?? ""}`);
}

function readAttemptActionIds(formData: FormData) {
  const drawId = Number(formData.get("drawId"));
  const attemptId = Number(formData.get("attemptId"));
  if (!Number.isSafeInteger(drawId) || drawId <= 0) return null;
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) return null;
  return { drawId, attemptId };
}

export async function markWinnerUnderReview(formData: FormData) {
  const actorId = await requireAdminUserId();
  const ids = readAttemptActionIds(formData);
  if (!ids) return;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("admin_mark_attempt_under_review", {
    p_actor_id: actorId,
    p_attempt_id: ids.attemptId,
  });
  if (error) throw new Error("No pudimos dejar al ganador en revision.");
  revalidatePath("/admin");
  revalidatePath(`/admin/sorteos/${ids.drawuߍ}����k�w��` code_suffix: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  expires_at: string;
  created_at: string;
};

const statusLabels = {
  pending: "Pendiente",
  confirmed: "Canjeado",
  cancelled: "Anulado",
  expired: "Vencido",
} as const;

export default async function RedemptionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/ingresar");

  const admin = createAdminSupabaseClient();
  const [pointsResult, rewardsResult, settingsResult, historyResult, accessResult] = await Promise.all([
    admin.from("points_ledger").select("amount").eq("profile_id", profileId),
    admin.from("reward_catalog").select("id,name,description,points_cost").eq("active", true).gt("stock_remaining", 0).order("display_order"),
    admin.rpc("get_reward_settings"),
    admin.from("point_redemptions").select("id,reward_name,points,ars_value,code_suffix,status,expires_at,created_at").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(12),
    admin.rpc("can_profile_redeem_points", { p_profile_id: profileId }),
  ]);

  const balance = (pointsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const settings = (settingsResult.data ?? {}) as Record<string, number>;
  const history = (historyResult.data ?? []) as RedemptionHistoryItem[];
  const canRedeem = accessResult.data === true;

  return (
    <main className="profile-shell">
      <header className="topbar">
        <Link className="brand" href="/">SUPER<span className="brand-dot">.</span><span className="brand-ar">AR</span><small>CLUB</small></Link>
        <Link className="profile-back" href="/perfil">← Mi perfil</Link>
      </header>

      <section className="profile-heading">
        <p className="eyebrow cyan">BENEFICIOS</p>
        <h1>Canjear puntos</h1>
        <p>Tenés <strong>{balance} SUPER Puntos</strong>.</p>
      </section>

      <section className="profile-panel">
        {canRedeem ? (
          <RedemptionForm
            balance={balance}
            minimum={Number(settings.minimum_redemption_points ?? 10)}
            arsPerPoint={Number(settings.ars_per_point ?? 100)}
            rewards={rewardsResult.data ?? []}
          />
        ) : (
          <div className="redemption-locked" role="status">
            <span>🔒</span>
            <h2>Canjes bloqueados</h2>
            <p>Completá tu participación en el sorteo actual para habilitar las misiones y usar todos tus SUPER Puntos.</p>
            <Link className="button primary" href="/">Ir al sorteo actual</Link>
          </div>
        )}
      </section>

      <section className="profile-panel redemption-history">
        <div><p className="eyebrow cyan">MIS MOVIMIENTOS</p><h2>Historial de canjes</h2></div>
        {history.length === 0 ? (
          <p className="redemption-history-empty">Todavía no generaste ningún canje.</p>
        ) : (
          <div className="redemption-history-list">
            {history.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.reward_name}</strong>
                  <small>{item.points} puntos · ${Number(item.ars_value).toLocaleString("es-AR")} · ••••{item.code_suffix}</small>
                </div>
                <div className="redemption-history-status">
                  <b className={`redemption-status ${item.status}`}>{statusLabels[item.status]}</b>
                  {item.status === "pending" && new Date(item.expires_at) > new Date() ? (
                    <form action={cancelRedemption}>
                      <input type="hidden" name="redemptionId" value={item.id} />
                      <button>Anular</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
