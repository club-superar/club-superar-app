import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { getServerSupabaseEnv } from "@/lib/supabase/env";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeInstagramUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidInstagramUsername(value: string) {
  return /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/.test(value);
}

export function participantEmail(username: string) {
  const { participantEmailDomain } = getServerSupabaseEnv();
  return `${username}@${participantEmailDomain}`;
}

export function generateRecoveryCode() {
  const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `SUPER-${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normalizeRecoveryCode(value: string) {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SUPER/, "");
  return raw.length === 10 ? `SUPER-${raw.slice(0, 5)}-${raw.slice(5)}` : value.trim().toUpperCase();
}

export function hashRecoveryCode(code: string) {
  const { recoveryCodePepper } = getServerSupabaseEnv();
  return createHmac("sha256", recoveryCodePepper).update(code).digest("hex");
}
