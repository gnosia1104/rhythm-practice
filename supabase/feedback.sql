-- =============================================================================
-- Rhythm Sight-Reader — Write-Only In-App Feedback Schema & RPC
-- =============================================================================
-- Security guarantees:
--   1. Zero public reads: only the project owner (Supabase Dashboard) can view feedback
--      (protects optional user reply emails from scraping).
--   2. Zero direct table access: RLS enabled + all direct grants revoked from anon/authenticated.
--   3. Write-only SECURITY DEFINER RPC callable by anon & authenticated (does NOT consume
--      Supabase Free Plan Anonymous Auth MAU).
--   4. Per-client 30-second cooldown + global hourly circuit breaker against flood spam.
-- =============================================================================

create table if not exists public.feedback_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  category    text        not null default 'idea',
  message     text        not null,
  contact     text        not null default '',
  lang        text        not null default 'ko',
  input_mode  text        not null default 'KEY',
  meta        jsonb       not null default '{}'::jsonb,
  client_hash text        not null default '',
  constraint chk_fb_cat check (category in ('bug', 'idea', 'audio', 'other')),
  constraint chk_fb_len check (length(message) between 3 and 800)
);

create index if not exists idx_fb_created_at on public.feedback_messages (created_at desc);
create index if not exists idx_fb_client_recent on public.feedback_messages (client_hash, created_at desc);

alter table public.feedback_messages enable row level security;
revoke all on public.feedback_messages from public, anon, authenticated;

create or replace function public.submit_feedback(
  p_category   text,
  p_message    text,
  p_contact    text  default '',
  p_lang       text  default 'ko',
  p_input_mode text  default 'KEY',
  p_meta       jsonb default '{}'::jsonb,
  p_client_id  text  default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat      text;
  v_msg      text;
  v_contact  text;
  v_lang     text;
  v_mode     text;
  v_meta     jsonb;
  v_client   text;
  v_last_at  timestamptz;
  v_hr_count integer;
begin
  v_cat := lower(btrim(coalesce(p_category, 'idea')));
  if v_cat not in ('bug', 'idea', 'audio', 'other') then
    v_cat := 'other';
  end if;

  v_msg := btrim(coalesce(p_message, ''));
  if length(v_msg) < 3 then
    raise exception 'message_too_short';
  end if;
  if length(v_msg) > 800 then
    raise exception 'message_too_long';
  end if;

  v_contact := left(btrim(coalesce(p_contact, '')), 80);
  v_lang    := left(lower(btrim(coalesce(p_lang, 'ko'))), 8);
  v_mode    := left(upper(btrim(coalesce(p_input_mode, 'KEY'))), 16);

  v_meta := coalesce(p_meta, '{}'::jsonb);
  if jsonb_typeof(v_meta) <> 'object' or octet_length(v_meta::text) > 1024 then
    v_meta := '{}'::jsonb;
  end if;

  v_client := coalesce(auth.uid()::text, left(regexp_replace(coalesce(p_client_id, ''), '[^A-Za-z0-9_-]', '', 'g'), 32), 'anon');
  if v_client = '' then
    v_client := 'anon';
  end if;

  -- Per-client 30-second cooldown
  select created_at into v_last_at
  from public.feedback_messages
  where client_hash = v_client
  order by created_at desc
  limit 1;

  if v_last_at is not null and v_last_at > (now() - interval '30 seconds') then
    raise exception 'rate_limited';
  end if;

  -- Global hourly circuit breaker against bot flooding
  select count(*) into v_hr_count
  from public.feedback_messages
  where created_at > (now() - interval '1 hour');

  if v_hr_count >= 100 then
    raise exception 'busy_try_later';
  end if;

  insert into public.feedback_messages (
    category, message, contact, lang, input_mode, meta, client_hash
  )
  values (
    v_cat, v_msg, v_contact, v_lang, v_mode, v_meta, v_client
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.submit_feedback(text, text, text, text, text, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
