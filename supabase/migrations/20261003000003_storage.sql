-- Tecnica Smartworks - Storage
-- Bucket privado "archivos". Ruta obligatoria: {project_id}/{requests|tasks}/{id}/{archivo}
-- Los archivos se sirven con URL firmada (createSignedUrl), nunca publicos.

insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 104857600) -- 100 MB
on conflict (id) do nothing;

create or replace function public.storage_project_id(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy archivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'archivos' and public.can_view_project(public.storage_project_id(name)));

create policy archivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archivos' and public.can_view_project(public.storage_project_id(name)));

create policy archivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'archivos' and (owner = auth.uid() or public.is_tecnica()));
