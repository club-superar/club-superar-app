-- Los proyectos nuevos de Supabase requieren permisos explicitos para la Data API.
-- Esta funcion administrativa nunca se expone al navegador: usa la secret key
-- exclusivamente desde el servidor y conserva RLS como defensa adicional.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

