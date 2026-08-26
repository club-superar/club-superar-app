-- Una misma publicación puede reutilizarse durante las pruebas y en futuras ediciones.
drop index if exists public.draws_instagram_media_id_unique_idx;

create index if not exists draws_instagram_media_id_idx
on public.draws (instagram_media_id)
where instagram_media_id is not null;
