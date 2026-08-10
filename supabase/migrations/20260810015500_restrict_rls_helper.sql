-- La función rls_auto_enable pertenece a la automatización del proyecto.
-- No necesita ser invocable desde la API pública ni por participantes.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
