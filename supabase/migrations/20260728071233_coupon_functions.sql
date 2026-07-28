-- 쿠폰 발급/사용 — 서버 로직(SECURITY DEFINER 함수)
--
-- docs/data-structure.md "쿠폰 발급" 규칙: 관람완료(파생) 스탬프 수가 9의 배수가 될 때마다
-- '사용가능' 쿠폰 1장을 발급한다. status는 저장하지 않는 bookings와 달리 coupons는 실제 row라서
-- 이 발급/사용완료 처리는 클라이언트가 직접 insert/update하지 못하게 막아뒀다(RLS는 select만 허용).
-- 대신 SECURITY DEFINER 함수로 "본인 것만, 정해진 조건에서만" 바뀌게 한다.

-- 지금 로그인한 사용자의 스탬프 수를 다시 세어, 아직 발급 안 된 9의 배수 구간만큼 쿠폰을 만든다.
-- 앱이 예매 목록을 새로 불러올 때(BookingsProvider.refresh)마다 호출한다 — 크론 없이도
-- "다음에 앱을 열었을 때" 발급되는 식으로 동작한다(docs/data-structure.md에 적어둔 두 방법 중 하나).
create or replace function public.issue_due_coupons()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_stamp_count integer;
  v_issued_count integer;
  v_to_issue integer;
  i integer;
begin
  if v_user_id is null then
    return;
  end if;

  select count(*) into v_stamp_count
  from bookings
  where user_id = v_user_id
    and is_cancelled = false
    and watched_at <= now();

  select count(*) into v_issued_count
  from coupons
  where user_id = v_user_id
    and issued_at_stamp_order is not null;

  v_to_issue := (v_stamp_count / 9) - v_issued_count;

  if v_to_issue > 0 then
    for i in 1..v_to_issue loop
      insert into coupons (user_id, benefit, discount_rate, status, issued_at_stamp_order)
      values (v_user_id, '다음 예매 10% 할인', 10, '사용가능', (v_issued_count + i) * 9);
    end loop;
  end if;
end;
$$;

grant execute on function public.issue_due_coupons() to authenticated;

-- 쿠폰 하나를 "사용완료"로 표시한다. 본인 소유이고 지금 '사용가능' 상태일 때만 바뀐다
-- (다른 사람 쿠폰을 id만 알고 사용완료 처리하거나, 이미 쓴 쿠폰을 다시 못 바꾸게 함).
create or replace function public.use_coupon(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update coupons
  set status = '사용완료'
  where id = p_coupon_id
    and user_id = auth.uid()
    and status = '사용가능';
end;
$$;

grant execute on function public.use_coupon(uuid) to authenticated;
