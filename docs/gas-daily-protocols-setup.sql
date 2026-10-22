create table if not exists public.gas_daily_protocols (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 protocol_date date not null,
 protocol_time time,
 temperature text not null default '',
 corrector_reading numeric,
 mechanical_reading numeric,
 previous_corrector_reading numeric,
 consumption numeric,
 modules jsonb not null default '[]'::jsonb,
 checker_name text not null default '',
 signature_data text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.gas_daily_protocols add column if not exists checker_name text not null default '';
alter table public.gas_daily_protocols add column if not exists signature_data text not null default '';
create index if not exists gas_daily_protocols_user_date_idx on public.gas_daily_protocols(user_id,protocol_date desc,protocol_time desc);
alter table public.gas_daily_protocols enable row level security;
drop policy if exists "Users can view own daily gas protocols" on public.gas_daily_protocols;
drop policy if exists "Authenticated users can view daily gas protocols" on public.gas_daily_protocols;
create policy "Authenticated users can view daily gas protocols" on public.gas_daily_protocols for select to authenticated using(true);
drop policy if exists "Users can insert own daily gas protocols" on public.gas_daily_protocols;
create policy "Users can insert own daily gas protocols" on public.gas_daily_protocols for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Users can update own daily gas protocols" on public.gas_daily_protocols;
create policy "Users can update own daily gas protocols" on public.gas_daily_protocols for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Users can delete own daily gas protocols" on public.gas_daily_protocols;
drop policy if exists "Authenticated users can delete daily gas protocols" on public.gas_daily_protocols;
create policy "Authenticated users can delete daily gas protocols" on public.gas_daily_protocols for delete to authenticated using(true);
grant select,insert,update,delete on public.gas_daily_protocols to authenticated;
