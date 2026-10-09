-- Безопасни еднократни линкове за подпис на клиент.
-- Изпълнете целия файл в Supabase Dashboard → SQL Editor → Run.

create table if not exists public.protocol_signing_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id uuid not null,
  protocol_no text not null,
  protocol_snapshot jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  signed_at timestamptz,
  client_name text,
  client_signature text
);

alter table public.protocol_signing_requests enable row level security;
revoke all on public.protocol_signing_requests from anon, authenticated;

create or replace function public.create_protocol_signing_request(p_pno text, p_company_id uuid)
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
  if coalesce(trim(p_pno),'') = '' or p_company_id is null then
    raise exception 'Липсва номер на протокол или фирма.';
  end if;

  select to_jsonb(p) into v_snapshot
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
  insert into public.protocol_signing_requests(token_hash, company_id, protocol_no, protocol_snapshot, created_by)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_company_id, p_pno, v_snapshot, v_user);
  return v_token;
end;
$$;

create or replace function public.get_protocol_for_signing(p_token text)
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
    'signed', (r.signed_at is not null),
    'expires_at', r.expires_at
  ) into v_data
  from public.protocol_signing_requests r
  where r.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and r.expires_at > now();
  if v_data is null then raise exception 'Линкът е невалиден или е изтекъл.'; end if;
  return v_data;
end;
$$;

create or replace function public.submit_protocol_signature(p_token text, p_client_name text, p_client_signature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.protocol_signing_requests%rowtype;
begin
  if coalesce(length(p_token),0) < 40 then raise exception 'Невалиден линк.'; end if;
  if coalesce(length(trim(p_client_name)),0) < 2 then raise exception 'Въведете името си.'; end if;
  if coalesce(length(p_client_signature),0) < 100 or length(p_client_signature) > 1000000
     or p_client_signature not like 'data:image/png;base64,%' then
    raise exception 'Поставете подпис в полето.';
  end if;

  select * into v_request
  from public.protocol_signing_requests r
  where r.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and r.expires_at > now()
  for update;

  if not found then raise exception 'Линкът е невалиден или е изтекъл.'; end if;
  if v_request.signed_at is not null then raise exception 'Този протокол вече е подписан.'; end if;

  update public.protocol_signing_requests
  set signed_at = now(), client_name = trim(p_client_name), client_signature = p_client_signature
  where id = v_request.id;

  update public.protocols
  set client_name = trim(p_client_name), client_sig = '<img src="' || p_client_signature || '" alt="Подписано от клиента" style="max-width:100%;max-height:90px">', saved_at = now()
  where company_id = v_request.company_id and pno = v_request.protocol_no;

  if not found then raise exception 'Не успях да намеря протокола за запис на подписа.'; end if;
  return true;
end;
$$;

revoke all on function public.create_protocol_signing_request(text, uuid) from public, anon;
grant execute on function public.create_protocol_signing_request(text, uuid) to authenticated;
revoke all on function public.get_protocol_for_signing(text) from public;
grant execute on function public.get_protocol_for_signing(text) to anon, authenticated;
revoke all on function public.submit_protocol_signature(text, text, text) from public;
grant execute on function public.submit_protocol_signature(text, text, text) to anon, authenticated;
