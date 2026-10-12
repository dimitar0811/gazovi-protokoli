-- Защитни линкове само за преглед на газови протоколи за фактуриране.
-- Изпълнете целия файл в Supabase Dashboard → SQL Editor → Run.
-- Отделно от линковете за подпис: не променя и не използва protocol_signing_requests.

create table if not exists public.protocol_accounting_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id uuid not null,
  protocol_no text not null,
  protocol_snapshot jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

alter table public.protocol_accounting_requests enable row level security;
revoke all on public.protocol_accounting_requests from anon, authenticated;

create or replace function public.create_protocol_accounting_request(p_pno text, p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_snapshot jsonb;
  v_token text;
begin
  if v_user is null then raise exception 'Влезте в приложението.'; end if;

  -- Допълнителна проверка: само одобрените имейли могат да създават линкове за фактуриране.
  if not exists (
    select 1
    from public.approved_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.approved = true
  ) then
    raise exception 'Нямате разрешение за достъп до приложението.';
  end if;

  if coalesce(trim(p_pno),'') = '' or p_company_id is null then
    raise exception 'Липсва номер на протокол или фирма.';
  end if;

  select jsonb_build_object(
    'pno', p.pno, 'date', p.date, 'client', p.client, 'eik', p.eik,
    'tech', p.tech, 'tech_name', p.tech_name, 'site', p.site, 'contact', p.contact,
    'cbm', p.cbm, 'cs', p.cs, 'cd', p.cd, 'c1', p.c1, 'c2', p.c2, 'cv', p.cv,
    'mbm', p.mbm, 'ms', p.ms, 'md', p.md, 'm1', p.m1, 'm2', p.m2, 'mv', p.mv,
    'notes', p.notes, 'client_name', p.client_name, 'tech_sig', p.tech_sig, 'client_sig', p.client_sig
  ) into v_snapshot
  from public.protocols p
  where p.company_id = p_company_id
    and p.pno = p_pno
    and (p.user_id = v_user or p.created_by = v_user or p.updated_by = v_user)
  order by p.saved_at desc
  limit 1;

  if v_snapshot is null then
    raise exception 'Протоколът не е намерен или нямате право да създадете линк.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.protocol_accounting_requests(token_hash, company_id, protocol_no, protocol_snapshot, created_by)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_company_id, p_pno, v_snapshot, v_user);
  return v_token;
end;
$$;

create or replace function public.get_protocol_for_accounting(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_data jsonb;
begin
  if coalesce(length(p_token),0) < 40 then raise exception 'Невалиден линк.'; end if;
  select jsonb_build_object(
    'protocol', r.protocol_snapshot,
    'expires_at', r.expires_at
  ) into v_data
  from public.protocol_accounting_requests r
  where r.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and r.expires_at > now();
  if v_data is null then raise exception 'Линкът е невалиден или е изтекъл.'; end if;
  return v_data;
end;
$$;

revoke all on function public.create_protocol_accounting_request(text, uuid) from public, anon;
grant execute on function public.create_protocol_accounting_request(text, uuid) to authenticated;
revoke all on function public.get_protocol_for_accounting(text) from public;
grant execute on function public.get_protocol_for_accounting(text) to anon, authenticated;
