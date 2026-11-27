-- =============================================================================
-- Rhythm Sight-Reader — Hardened Global Leaderboard Schema & RPCs (v2)
-- =============================================================================
-- Prerequisites in Supabase Dashboard:
--   Authentication -> Providers -> Anonymous Sign-Ins -> Enable ("Allow anonymous sign-ins")
--
-- Security guarantees:
--   1. Anonymous Auth (auth.uid()): no client-supplied user/client IDs; nobody can hijack #1.
--   2. Zero direct table access: RLS enabled + all direct grants revoked from anon/authenticated.
--   3. Read RPC (get_leaderboard) NEVER exposes user_id; returns server-computed is_me boolean.
--   4. Write RPC (submit_leaderboard_score) enforces strict score/max_score/acc/sd/rank/date
--      bounds, per-board rate limiting, KO/EN/JA nickname profanity filter, and best-score lock.
--   5. Input-mode filtering (ALL / KEY / AUDIO / MIDI / PAD) supported at index & RPC level.
-- =============================================================================

-- Clean up v1 objects if migrating from initial table
drop function if exists public.submit_leaderboard_score(
  text, text, text, text, integer, integer, integer, numeric, numeric, text, integer, integer, text
);
drop function if exists public.get_leaderboard(text, text, integer);
drop table if exists public.leaderboard_scores;

-- 1) Table keyed by cryptographic Supabase auth.uid()
create table public.leaderboard_scores (
  board_key   text         not null,
  user_id     uuid         not null,
  nickname    text         not null,
  title       text         not null default '',
  score       integer      not null default 0,
  max_score   integer      not null default 0,
  bars        integer      not null default 0,
  acc         numeric(5,1) not null default 0,
  sd_ms       numeric(6,1) not null default 0,
  rank_grade  text         not null default '',
  bpm         integer      not null default 60,
  level       integer      not null default 1,
  input_mode  text         not null default 'KEY',
  updated_at  timestamptz  not null default now(),
  primary key (board_key, user_id),
  constraint chk_lb_acc        check (acc >= 0 and acc <= 100),
  constraint chk_lb_sd         check (sd_ms >= 0 and sd_ms <= 500),
  constraint chk_lb_bpm        check (bpm >= 40 and bpm <= 180),
  constraint chk_lb_level      check (level >= 1 and level <= 6),
  constraint chk_lb_rank       check (rank_grade in ('S+', 'S', 'A', 'B', 'C')),
  constraint chk_lb_input_mode check (input_mode in ('KEY', 'AUDIO', 'MIDI', 'PAD', 'BOTH'))
);

-- 2) Indexes for fast global + input-mode filtered leaderboards
create index idx_lb_daily_rank
  on public.leaderboard_scores (board_key, score desc, sd_ms asc, acc desc);

create index idx_lb_survival_rank
  on public.leaderboard_scores (board_key, bars desc, acc desc, bpm desc);

create index idx_lb_daily_mode_rank
  on public.leaderboard_scores (board_key, input_mode, score desc, sd_ms asc, acc desc);

create index idx_lb_survival_mode_rank
  on public.leaderboard_scores (board_key, input_mode, bars desc, acc desc, bpm desc);

-- 3) Strict RLS & zero direct table exposure (prevents user_id scraping or direct writes)
alter table public.leaderboard_scores enable row level security;
revoke all on public.leaderboard_scores from public, anon, authenticated;

-- 4) Internal KO/EN/JA nickname moderation helper (not directly callable by clients)
create or replace function public.is_clean_nickname(p_nick text, p_max_len integer default 16)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw   text;
  v_norm  text;
  v_ascii text;
begin
  v_raw := coalesce(p_nick, '');
  if length(btrim(v_raw)) < 1 or length(btrim(v_raw)) > greatest(1, coalesce(p_max_len, 16)) then
    return false;
  end if;

  -- Block URLs / invite spam
  if lower(v_raw) ~ '(https?://|www\.|discord\.gg|\.com|\.net|\.kr|\.jp|\.io|t\.me/)' then
    return false;
  end if;

  -- Strip spaces, punctuation, underscores, zero-width chars for bypass-resistant matching
  v_norm := regexp_replace(lower(v_raw), '[\s\.\-_,~!@#$%^&*()+=\[\]{}|\\/:;''"`<>?·•​‌‍]+', '', 'g');
  -- Also map common leetspeak digits for English profanity checks
  v_ascii := translate(v_norm, '013457@$', 'oieastas');

  -- Korean profanity / slurs / jamo abbreviations
  if v_norm ~ '(시발|씨발|씨팔|시팔|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|새끼|색기|좆|존나|졸라|지랄|ㅈㄹ|보지|자지|창녀|창남|느금|애미|애비|니미|니애미|엠창|미친놈|미친년|꺼져|ㄲㅈ|뒤져|장애인|한남|한녀|일베|메갈|워마드|씹새|씹년|씹놈|걸레|호로|쌍년|쌍놈|엿먹|닥쳐)' then
    return false;
  end if;

  -- English profanity / hate speech
  if v_ascii ~ '(fuck|fuk|phuck|shit|bitch|cunt|nigg|faggot|fag|whore|slut|dick|cock|pussy|asshole|bastard|retard|nazi|hitler|porn|rape|kys)' then
    return false;
  end if;

  -- Japanese profanity / slurs
  if v_norm ~ '(死ね|しね|シネ|くそ|クソ|ちんこ|チンコ|まんこ|マンコ|きちがい|キチガイ|がいじ|ガイジ|ぶす|ブス|ばかやろう|ファック|セックス)' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_clean_nickname(text, integer) from public, anon, authenticated;

-- 5) Public Read RPC — NEVER returns user_id; returns server-computed is_me boolean
create or replace function public.get_leaderboard(
  p_board_key   text,
  p_input_mode  text    default 'ALL',
  p_limit       integer default 20
)
returns table (
  board_key   text,
  nickname    text,
  title       text,
  score       integer,
  max_score   integer,
  bars        integer,
  acc         numeric(5,1),
  sd_ms       numeric(6,1),
  rank_grade  text,
  bpm         integer,
  level       integer,
  input_mode  text,
  updated_at  timestamptz,
  is_me       boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survival boolean;
  v_mode     text;
  v_lim      integer;
  v_uid      uuid;
begin
  if p_board_key !~ '^(daily|dailyplus):\d{4}-\d{2}-\d{2}$'
     and p_board_key !~ '^(endless|endless_sd3):all$' then
    raise exception 'invalid_board_key';
  end if;

  v_mode := upper(coalesce(nullif(btrim(p_input_mode), ''), 'ALL'));
  if v_mode not in ('ALL', 'KEY', 'AUDIO', 'MIDI', 'PAD', 'BOTH') then
    v_mode := 'ALL';
  end if;

  v_lim := least(50, greatest(1, coalesce(p_limit, 20)));
  v_survival := p_board_key in ('endless:all', 'endless_sd3:all');
  v_uid := auth.uid();

  if v_survival then
    return query
      select
        s.board_key, s.nickname, s.title, s.score, s.max_score, s.bars,
        s.acc, s.sd_ms, s.rank_grade, s.bpm, s.level, s.input_mode, s.updated_at,
        (v_uid is not null and s.user_id = v_uid) as is_me
      from public.leaderboard_scores s
      where s.board_key = p_board_key
        and (
          v_mode = 'ALL'
          or (v_mode = 'AUDIO' and s.input_mode in ('AUDIO', 'BOTH'))
          or s.input_mode = v_mode
        )
      order by s.bars desc, s.acc desc, s.bpm desc, s.updated_at asc
      limit v_lim;
  else
    return query
      select
        s.board_key, s.nickname, s.title, s.score, s.max_score, s.bars,
        s.acc, s.sd_ms, s.rank_grade, s.bpm, s.level, s.input_mode, s.updated_at,
        (v_uid is not null and s.user_id = v_uid) as is_me
      from public.leaderboard_scores s
      where s.board_key = p_board_key
        and (
          v_mode = 'ALL'
          or (v_mode = 'AUDIO' and s.input_mode in ('AUDIO', 'BOTH'))
          or s.input_mode = v_mode
        )
      order by s.score desc, s.sd_ms asc, s.acc desc, s.updated_at asc
      limit v_lim;
  end if;
end;
$$;

grant execute on function public.get_leaderboard(text, text, integer) to anon, authenticated;

-- 6) Authenticated Write RPC — uses auth.uid() ONLY, full anti-cheat + rate limit + profanity filter
create or replace function public.submit_leaderboard_score(
  p_board_key   text,
  p_nickname    text,
  p_title       text    default '',
  p_score       integer default 0,
  p_max_score   integer default 0,
  p_bars        integer default 0,
  p_acc         numeric default 0,
  p_sd_ms       numeric default 0,
  p_rank_grade  text    default 'C',
  p_bpm         integer default 60,
  p_level       integer default 1,
  p_input_mode  text    default 'KEY'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid;
  v_survival   boolean;
  v_board_date date;
  v_max_cap    integer;
  v_nick       text;
  v_title      text;
  v_rank       text;
  v_mode       text;
  v_acc        numeric(5,1);
  v_sd         numeric(6,1);
  v_last_upd   timestamptz;
begin
  -- Cryptographic identity from Supabase Anonymous Auth (cannot be spoofed by client)
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  -- Board key format & date-window validation
  if p_board_key ~ '^(daily|dailyplus):\d{4}-\d{2}-\d{2}$' then
    v_survival := false;
    v_board_date := split_part(p_board_key, ':', 2)::date;
    -- Allow ±2 days window around UTC date to cover all global timezones safely
    if v_board_date < (current_date - 2) or v_board_date > (current_date + 1) then
      raise exception 'invalid_board_date';
    end if;
  elsif p_board_key in ('endless:all', 'endless_sd3:all') then
    v_survival := true;
  else
    raise exception 'invalid_board_key';
  end if;

  -- Per-user per-board rate limiting (reject rapid console spam < 2s)
  select updated_at into v_last_upd
  from public.leaderboard_scores
  where board_key = p_board_key and user_id = v_uid;

  if v_last_upd is not null and v_last_upd > (now() - interval '2 seconds') then
    raise exception 'rate_limited';
  end if;

  -- Nickname sanitization & server-side profanity check
  v_nick := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
  v_nick := left(v_nick, 16);
  if v_nick = '' then
    v_nick := 'Player';
  end if;
  if not public.is_clean_nickname(v_nick) then
    raise exception 'nickname_not_allowed';
  end if;

  v_title := left(btrim(coalesce(p_title, '')), 24);
  if v_title <> '' and not public.is_clean_nickname(v_title, 24) then
    v_title := '';
  end if;

  -- Strict whitelists & numeric bounds (reject tampered values instead of silently clamping)
  v_rank := upper(btrim(coalesce(p_rank_grade, '')));
  if v_rank not in ('S+', 'S', 'A', 'B', 'C') then
    raise exception 'invalid_rank_grade';
  end if;

  v_mode := upper(btrim(coalesce(p_input_mode, 'KEY')));
  if v_mode not in ('KEY', 'AUDIO', 'MIDI', 'PAD', 'BOTH') then
    raise exception 'invalid_input_mode';
  end if;

  if p_bpm is null or p_bpm < 40 or p_bpm > 180 then
    raise exception 'invalid_bpm';
  end if;

  if p_level is null or p_level < 1 or p_level > 6 then
    raise exception 'invalid_level';
  end if;

  if p_acc is null or p_acc < 0 or p_acc > 100 then
    raise exception 'invalid_acc';
  end if;

  if p_sd_ms is null or p_sd_ms < 0 or p_sd_ms > 500 then
    raise exception 'invalid_sd_ms';
  end if;

  v_acc := round(p_acc::numeric, 1);
  v_sd  := round(p_sd_ms::numeric, 1);

  -- Board-specific score / max_score / bars sanity caps
  if v_survival then
    if p_bars is null or p_bars <= 0 or p_bars > 2000 then
      raise exception 'invalid_bars';
    end if;
    if p_score is null or p_score < 0 or p_score > (p_bars * 200 + 20000) then
      raise exception 'invalid_survival_score';
    end if;
  else
    -- Daily (4/4, 8 bars) max possible ~45,000; Daily+ (5/4 or 6/8, 8 bars) max possible ~55,000
    v_max_cap := case when p_board_key like 'dailyplus:%' then 55000 else 45000 end;
    if p_max_score is null or p_max_score < 400 or p_max_score > v_max_cap then
      raise exception 'invalid_max_score';
    end if;
    if p_score is null or p_score <= 0 or p_score > p_max_score then
      raise exception 'invalid_score';
    end if;
    -- Rank consistency sanity check
    if v_rank = 'S+' and (v_acc < 99.0 or p_score < floor(p_max_score * 0.94)) then
      raise exception 'inconsistent_rank';
    end if;
  end if;

  insert into public.leaderboard_scores (
    board_key, user_id, nickname, title,
    score, max_score, bars, acc, sd_ms,
    rank_grade, bpm, level, input_mode, updated_at
  )
  values (
    p_board_key, v_uid, v_nick, v_title,
    p_score, greatest(0, coalesce(p_max_score, 0)), greatest(0, coalesce(p_bars, 0)),
    v_acc, v_sd, v_rank, p_bpm, p_level, v_mode, now()
  )
  on conflict (board_key, user_id) do update
  set
    nickname   = excluded.nickname,
    title      = excluded.title,
    updated_at = now(),
    score = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.score else leaderboard_scores.score end,
    max_score = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.max_score else leaderboard_scores.max_score end,
    bars = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.bars else leaderboard_scores.bars end,
    acc = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.acc else leaderboard_scores.acc end,
    sd_ms = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.sd_ms else leaderboard_scores.sd_ms end,
    rank_grade = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.rank_grade else leaderboard_scores.rank_grade end,
    bpm = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.bpm else leaderboard_scores.bpm end,
    level = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.level else leaderboard_scores.level end,
    input_mode = case when (
      (v_survival and (
        excluded.bars > leaderboard_scores.bars
        or (excluded.bars = leaderboard_scores.bars and excluded.acc > leaderboard_scores.acc)
        or (excluded.bars = leaderboard_scores.bars and excluded.acc = leaderboard_scores.acc and excluded.bpm > leaderboard_scores.bpm)
      )) or (not v_survival and (
        excluded.score > leaderboard_scores.score
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms < leaderboard_scores.sd_ms)
        or (excluded.score = leaderboard_scores.score and excluded.sd_ms = leaderboard_scores.sd_ms and excluded.acc > leaderboard_scores.acc)
      ))
    ) then excluded.input_mode else leaderboard_scores.input_mode end;
end;
$$;

-- Only authenticated (including Supabase Anonymous Sign-In) users can call submit_leaderboard_score
revoke all on function public.submit_leaderboard_score(
  text, text, text, integer, integer, integer, numeric, numeric, text, integer, integer, text
) from public, anon;

grant execute on function public.submit_leaderboard_score(
  text, text, text, integer, integer, integer, numeric, numeric, text, integer, integer, text
) to authenticated;

-- Refresh PostgREST schema cache immediately
notify pgrst, 'reload schema';
