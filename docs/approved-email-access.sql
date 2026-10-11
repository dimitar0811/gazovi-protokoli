-- Ограничаване на достъпа до общия архив по одобрен имейл.
-- Изпълнете целия файл в Supabase Dashboard -> SQL Editor -> Run.
-- След това включете Authentication -> Sign In / Providers -> Confirm email.

create table if not exists public.approved_emails (
  email text primary key,
  approved boolean not null default true,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_emails_email_format check (position('@' in email) > 1)
);

alter table public.approved_emails enable row level security;
revoke all on public.approved_emails from anon, authenticated;

insert into public.approved_emails(email, approved, role)
values ('19dimitar64@gmail.com', true, 'admin')
on conflict (email) do update set approved = true, role = 'admin', updated_at = now();

create or replace function public.is_approved_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.approved_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.approved = true
  );
$$;

revoke all on function public.is_approved_app_user() from public, anon;
grant execute on function public.is_approved_app_user() to authenticated;

create or replace function public.check_app_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('approved', false, 'role', 'user');
  end if;

  select a.role into v_role
  from public.approved_emails a
  where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and a.approved = true;

  return jsonb_build_object('approved', v_role is not null, 'role', coalesce(v_role, 'user'));
end;
$$;

revoke all on function public.check_app_access() from public, anon;
grant execute on function public.check_app_access() to authenticated;

create or replace function public.admin_set_approved_email(
  p_email text,
  p_approved boolean,
  p_role text default 'user'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or not exists (
    select 1 from public.approved_emails a
    where lower(a.email) = v_admin_email
      and a.approved = true
      and a.role = 'admin'
  ) then
    raise exception 'Нямате администраторски права.';
  end if;

  if coalesce(trim(p_email), '') = '' or position('@' in p_email) < 2 then
    raise exception 'Въведете валиден имейл.';
  end if;
  if p_role not in ('admin', 'user') then
    raise exception 'Невалидна роля.';
  end if;
  if lower(trim(p_email)) = v_admin_email and (not p_approved or p_role <> 'admin') then
    raise exception 'Не можете да премахнете или понижите собствения си администраторски достъп.';
  end if;

  insert into public.approved_emails(email, approved, role, updated_at)
  values (lower(trim(p_email)), p_approved, p_role, now())
  on conflict (email) do update
    set approved = excluded.approved,
        role = excluded.role,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.admin_set_approved_email(text, boolean, text) from public, anon;
grant execute on function public.admin_set_approved_email(text, boolean, text) to authenticated;

create or replace function public.admin_get_approved_email_status(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_admin_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_approved boolean;
  v_role text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.approved_emails a
    where lower(a.email) = v_admin_email
      and a.approved = true
      and a.role = 'admin'
  ) then
    raise exception 'Нямате администраторски права.';
  end if;

  select a.approved, a.role into v_approved, v_role
  from public.approved_emails a
  where lower(a.email) = lower(trim(p_email));

  return jsonb_build_object(
    'email', lower(trim(p_email)),
    'found', v_approved is not null,
    'approved', coalesce(v_approved, false),
    'role', coalesce(v_role, 'user')
  );
end;
$$;

revoke all on function public.admin_get_approved_email_status(text) from public, anon;
grant execute on function public.admin_get_approved_email_status(text) to authenticated;

-- Restrictive policy adds an approval gate on top of existing protocol policies.
-- Existing company/archive policies are preserved.
drop policy if exists approved_email_gate on public.protocols;
create policy approved_email_gate
  on public.protocols
  as restrictive
  for all
  to authenticated
  using (public.is_approved_app_user())
  with check (public.is_approved_app_user());

-- Block direct anonymous access even if an older permissive policy exists.
drop policy if exists block_anon_protocol_access on public.protocols;
create policy block_anon_protocol_access
  on public.protocols
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

