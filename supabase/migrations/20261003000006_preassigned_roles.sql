-- Tecnica Smartworks - rol pre-asignado en allowed_emails
-- Tecnica puede cargar un correo (de @smartworks.es o externo) con el rol que tendra al darse de alta.

alter table public.allowed_emails
  add column role public.user_role not null default 'solicitante';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or not public.is_email_allowed(new.email) then
    raise exception 'Correo no autorizado';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(
      (select a.role from public.allowed_emails a where a.email = lower(trim(new.email))),
      'solicitante'
    )
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
