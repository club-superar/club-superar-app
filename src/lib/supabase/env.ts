function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
}

export function getPublicSupabaseEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function getServerSupabaseEnv() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const recoveryCodePepper = process.env.RECOVERY_CODE_PEPPER;
  const participantEmailDomain =
    process.env.PARTICIPANT_EMAIL_DOMAIN ?? "participants.club-superar.internal";

  if (!secretKey) throw new Error("Falta configurar SUPABASE_SECRET_KEY");
  if (!recoveryCodePepper) throw new Error("Falta configurar RECOVERY_CODE_PEPPER");

  return { ...getPublicSupabaseEnv(), secretKey, recoveryCodePepper, participantEmailDomain };
}
