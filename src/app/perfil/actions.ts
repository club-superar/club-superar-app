"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidInstagramUsername, normalizeInstagramUsername } from "@/lib/auth/participant";

export type UsernameState = { error?: string; success?: string; username?: string };

export async function changeInstagramUsername(_: UsernameState, formData: FormData): Promise<UsernameState> {
  const username = normalizeInstagramUsername(String(formData.get("instagram") ?? ""));
  if (!isValidInstagramUsername(username)) return { error: "Ingresá un usuario de Instagram válido, sin el @." };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("change_own_instagram_username", { p_new_username: username });
  if (error?.message.includes("USERNAME_TAKEN")) return { error: "Ese usuario ya pertenece a otra cuenta del Club." };
  if (error?.message.includes("USERNAME_COOLDOWN")) return { error: "Podés cambiarlo una vez cada 30 días. Si necesitás corregirlo antes, comunicate con SUPER.AR." };
  if (error?.message.includes("INVALID_USERNAME")) return { error: "El usuario no tiene un formato válido." };
  if (error) return { error: "No pudimos actualizar el usuario. Intentá nuevamente." };
  const newUsername = typeof data === "string" ? data : username;
  revalidatePath("/");
  revalidatePath("/perfil");
  revalidatePath(`/miembro/${newUsername}`);
  return { success: "Usuario actualizado. También podés seguir entrando con el anterior.", username: newUsername };
}
