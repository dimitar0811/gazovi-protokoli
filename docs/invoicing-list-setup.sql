-- Настройка на общия списък „Протоколи за фактуриране“.
-- Изпълнете целия файл еднократно в Supabase Dashboard → SQL Editor → Run.
-- Използва съществуващата таблица public.protocols и не променя линковете за подпис.

alter table public.protocols
  add column if not exists accounting_status text,
  add column if not exists accounting_sent_at timestamptz,
  add column if not exists accounting_processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.protocols'::regclass
      and conname = 'protocols_accounting_status_check'
  ) then
    alter table public.protocols
      add constraint protocols_accounting_status_check
      check (accounting_status is null or accounting_status in ('pending','processed'));
  end if;
end $$;

create index if not exists protocols_accounting_list_idx
  on public.protocols (company_id, accounting_status, accounting_sent_at desc)
  where accounting_status is not null;

-- Включва в списъка вече изпращани протоколи, за които има защитен линк за счетоводството.
update public.protocols p
set accounting_status = 'pending',
    accounting_sent_at = coalesce(p.accounting_sent_at, now())
where p.accounting_status is null
  and exists (
    select 1
    from public.protocol_accounting_requests r
    where r.company_id = p.company_id
      and r.protocol_no = p.pno
  );
