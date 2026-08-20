-- PostgREST necesita leer la clave primaria para resolver la relacion publica
-- winners -> winner_deliveries. No se habilita ninguna escritura adicional.
grant select (id) on public.winners to anon, authenticated;
