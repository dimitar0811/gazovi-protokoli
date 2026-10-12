-- Роля „accounting“ и защита на статуса за фактуриране.
-- Изпълнете еднократно в Supabase SQL Editor след approved-email-access.sql.
-- Не изтрива протоколи и не променя линковете за подпис.

alter table public.approved_emails drop constraint if exists approved_emails_role_check;
alter table public.approved_emails
  add constraint approved_emails_role_check check (role in ('admin','user','accounting'));

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
  if p_role not in ('admin', 'user', 'accounting') then
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

-- Не позволява на обикновените потребители да променят счетоводния статус.
create or replace function public.guard_protocol_accounting_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select a.role into v_role
  from public.approved_emails a
  where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and a.approved = true;

  if coalesce(v_role, 'user') not in ('admin', 'accounting') then
    if tg_op = 'INSERT' then
      if new.accounting_status is not null
         or new.accounting_sent_at is not null
         or new.accounting_processed_at is not null then
        raise exception 'Само счетоводството може да променя статуса за фактуриране.';
      end if;
    elsif new.accounting_status is distinct from old.accounting_status
       or new.accounting_sent_at is distinct from old.accounting_sent_at
       or new.accounting_processed_at is distinct from old.accounting_processed_at then
      raise exception 'Само счетоводството може да променя статуса за фактуриране.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protocol_accounting_status_guard on public.protocols;
create trigger protocol_accounting_status_guard
before insert or update on public.protocols
for each row execute function public.guard_protocol_accounting_status();
