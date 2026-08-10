"use server";

import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  isValidInstagramUsername,
  normalizeInstagramUsername,
  normalizeRecoveryCode,
  participantEmail,
} from "@/lib/auth/participant";

export type AuthState = { error?: string; recoveryCode?: string; username?: string };

export async function registerParticipant(_: AuthState, formData: FormData): Promise<AuthState> {
  const username = normalizeInstagramUsername(String(formData.get("instagram") ?? ""));
  if (!isValidInstagramUsername(username)) {
    return { error: "Ingresá un usuario de Instagram válido, sin el @." };
  }

  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("instagram_username_normalized", username)
    .maybeSingle();
  if (existing) return { error: "Ese usuario ya está registrado. Probá ingresar con tu código." };

  const recoveryCode = generateRecoveryCode();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: participantEmail(username),
    password: recoveryCode,
    email_confirm: true,
    user_metadata: { account_type: "participant" },
  });
  if (createError || !created.user) return { error: "No pudimos crear la cuenta. Intentá nuevamente." };

  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    instagram_username: username,
    instagram_username_normalized: username,
  });
  const { error: secretError } = profileError
    ? { error: profileError }
    : await admin.schema("private").from("profile_secrets").insert({
        profile_id: userId,
        recovery_code_hash: hashRecoveryCode(recoveryCode),
      });

  if (profileError || secretError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError?.code === "23505" ? "Ese usuario ya está registrado." : "No pudimos terminar el registro." };
  }

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: participantEmail(username),
    password: recoveryCode,
  });
  if (signInError) return { error: "La cuenta se creó, pero no pudimos iniciar la sesión. Ingresá con el código mostrado." };

  return { recoveryCode, username };
}

export async function loginParticipant(_: AuthState, formData: FormData): Promise<AuthState> {
  const username = normalizeInstagramUsername(String(formData.get("instagram") ?? ""));
  const recoveryCode = normalizeRecoveryCode(String(formData.get("recoveryCode") ?? ""));
  if (!isValidInstagramUsername(username) || !/^SUPER-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(recoveryCode)) {
    return { error: "Revisá el usuario y el código de recuperación." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: participantEmail(username),
    password: recoveryCode,
  });
  if (error) return { error: "El usuario o el código no coinciden." };
  redirect("/perfil");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
