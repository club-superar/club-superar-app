-- Club SUPER.AR - Los archivos visuales se generan en el navegador y no se conservan.

drop table if exists public.generated_assets;

insert into private.app_settings (setting_key, setting_value)
values (
  'storage_policy',
  '{"winner_assets":"client_download_only","ticket_images":"temporary_delete_after_processing","postgres_binary_files":false}'::jsonb
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    version = private.app_settings.version + 1,
    updated_at = now();
