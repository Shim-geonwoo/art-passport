-- 예매 취소 — 서버 로직(SECURITY DEFINER 함수)
--
-- docs/data-flow.md 3장 "취소 분기": 관람 전(watched_at 미래)에만 취소 가능하고,
-- 취소된 예매가 쿠폰을 썼다면 그 쿠폰을 다시 '사용가능'으로 되돌린다.
-- 예매 취소(bookings.is_cancelled)와 쿠폰 반환(coupons.status)을 한 함수에서 함께 처리해,
-- "예매는 취소됐는데 쿠폰은 안 돌아온" 어긋난 상태가 생기지 않게 한다.
-- (쿠폰은 클라이언트가 직접 못 바꾸므로 — RLS는 select만 허용 — 여기서 대신 바꾼다)

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon_id uuid;
begin
  -- 본인 소유 + 아직 관람 전(미래) + 미취소 예매만 취소한다.
  -- 조건에 안 맞으면(남의 것, 이미 취소, 관람 지남) 아무 행도 안 바뀌고 v_coupon_id는 null로 남는다.
  update bookings
  set is_cancelled = true
  where id = p_booking_id
    and user_id = auth.uid()
    and is_cancelled = false
    and watched_at > now()
  returning used_coupon_id into v_coupon_id;

  -- 취소된 예매가 쿠폰을 썼다면 그 쿠폰을 다시 '사용가능'으로 되돌린다
  if v_coupon_id is not null then
    update coupons
    set status = '사용가능'
    where id = v_coupon_id
      and user_id = auth.uid()
      and status = '사용완료';
  end if;
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;
