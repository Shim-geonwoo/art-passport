-- 카탈로그 날짜 밀기 — 시간이 지나도 예매할 게 남아 있도록
--
-- 문제: 시드의 공연·전시 날짜가 고정 timestamp라, 시간이 지나면 하나씩 지나가고
-- 결국 예매 탭이 텅 빈다(시드 기준으로 공연은 8월에 몰려 있고 전시도 11월이 끝이다).
-- 포트폴리오로 계속 보여줄 앱이라 이대로 두면 어느 날 죽은 앱처럼 보인다.
--
-- 해결: 카탈로그 전체를 같은 일수만큼 통째로 미는 함수를 둔다. 데모 전에 한 번 돌리면
-- "시드를 방금 넣은 상태"와 같은 모습으로 돌아온다.
--
-- 기준점(70일): 시드를 만든 날, 가장 이른 이벤트(요시고 사진전)는 정확히 70일 전에 시작하는
-- 모양이었다. 그 관계를 유지하면 "지금 하는 전시 + 곧 열리는 공연 + 이미 지난 것"이
-- 골고루 섞인 원래 구성이 그대로 재현된다. 70은 7의 배수라 요일도 그대로 유지된다.
--
-- bookings는 건드리지 않는다: watched_at은 "그때 그 사람이 산 관람 시각"의 스냅샷이라
-- 나중에 고치면 이미 찍힌 스탬프나 지난 예매 기록이 뒤바뀐다. 그래서 예매는 과거에 남고
-- 카탈로그만 앞으로 간다. (그 결과 오래된 예매의 schedule_id가 가리키는 회차는 시각이
--  달라지는데, 화면은 어디서도 그 회차 시각을 쓰지 않고 watched_at만 보므로 문제되지 않는다)

create or replace function public.shift_catalog_dates()
returns integer -- 실제로 민 일수 (0이면 아직 밀 필요가 없었다는 뜻)
language plpgsql
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  -- "가장 이른 이벤트는 오늘로부터 70일 전에 시작한다"를 유지한다 (위 주석 참고)
  c_anchor_days constant integer := 70;

  v_earliest date;
  v_shift_days integer;
begin
  select min((show_at at time zone c_tz)::date) into v_earliest from events;
  if v_earliest is null then
    return 0; -- 카탈로그가 비어 있으면 할 일이 없다
  end if;

  -- 밀어야 할 일수 = (오늘 - 70일) - 지금 가장 이른 날
  v_shift_days := ((now() at time zone c_tz)::date - c_anchor_days) - v_earliest;

  -- 요일이 바뀌지 않도록 7의 배수로 맞춘다 (금요일 공연이 계속 금요일이도록)
  v_shift_days := (round(v_shift_days / 7.0) * 7)::integer;

  if v_shift_days = 0 then
    return 0;
  end if;

  -- 전시 종료일(show_end_at)은 null일 수 있는데, null에 더하면 그대로 null이라 그냥 둬도 된다
  update events
  set show_at = show_at + make_interval(days => v_shift_days),
      show_end_at = show_end_at + make_interval(days => v_shift_days);

  update event_schedules
  set starts_at = starts_at + make_interval(days => v_shift_days);

  return v_shift_days;
end;
$$;

-- 이 함수는 카탈로그를 통째로 고쳐 쓰는 운영용 도구다. 앱(anon/authenticated)이 부를 일이 없다.
-- PostgreSQL은 새 함수의 실행 권한을 PUBLIC에 기본으로 주기 때문에, 명시적으로 회수한다.
--
-- 이 회수가 유일한 방어선이다. 이 마이그레이션을 만들 때는 events/event_schedules에 select
-- 정책밖에 없어서 "설령 실행되더라도 RLS에 막힌다"고 적어뒀는데, 뒤에 관리자 쓰기 정책이
-- 생기면서(20260806150000_admin_role.sql) 그 말은 더 이상 맞지 않는다 —
-- 관리자 계정으로 이 함수를 부르면 카탈로그 날짜가 실제로 전부 밀린다.
revoke execute on function public.shift_catalog_dates() from public;

-- 이 마이그레이션을 적용하는 시점에도 한 번 맞춰둔다.
select public.shift_catalog_dates();
