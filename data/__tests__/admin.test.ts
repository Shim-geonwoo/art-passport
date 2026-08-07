// 회차 입력 검증 테스트
//
// 회차를 저장하기 전에 화면이 값을 검사한다. 서버도 일부는 막지만(정원 음수), 나머지는
// **DB에 막을 방법이 없어서 여기서만 걸린다.** 그래서 이 검사가 곧 규칙 그 자체다:
//
//   - 정원을 이미 판 매수보다 낮추면 → 취소해도 자리가 안 열리고 잔여석이 음수가 된다
//   - 같은 시각 회차가 둘이면   → 예매 화면에 똑같이 생긴 줄이 두 개 뜬다
//
// 화면 없이 확인할 수 있도록 순수 함수로 떼어놨고, 여기서 그 함수만 부른다.

import { validateScheduleDraft } from '@/data/admin';
import type { AdminScheduleItem } from '@/data/admin';

// data/admin.ts가 Supabase 클라이언트를 가져오지만 검증에는 쓰이지 않는다.
// (쓰이는 건 fetch/create 쪽이고 여기서는 부르지 않는다 — data/__tests__/bookings.test.ts와 같은 처리)
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function makeSchedule(
  id: string,
  startsAt: string,
  overrides: Partial<AdminScheduleItem> = {}
): AdminScheduleItem {
  return {
    id,
    startsAt: new Date(startsAt),
    capacity: 100,
    soldCount: 0,
    ...overrides,
  };
}

// 시간대를 일부러 안 붙인다. 실행하는 기기의 로컬 시간으로 읽히는데, 검증도 로컬 기준이라
// 어느 시간대에서 돌려도 결과가 같다.
const 회차 = makeSchedule('s1', '2026-08-14T19:30:00');

describe('validateScheduleDraft — 형식', () => {
  it('제대로 적은 값은 Date와 정원으로 바뀐다', () => {
    const result = validateScheduleDraft({ date: '2026-08-14', time: '19:30', capacity: '1200' }, [], null);

    expect(result).toEqual({
      input: { startsAt: new Date('2026-08-14T19:30:00'), capacity: 1200 },
    });
  });

  it('없는 날짜(2026-02-31)는 3월로 넘어가지 않고 걸린다', () => {
    const result = validateScheduleDraft({ date: '2026-02-31', time: '19:30', capacity: '100' }, [], null);

    expect(result).toHaveProperty('error');
  });

  it('24시나 60분 같은 시각은 걸린다', () => {
    expect(
      validateScheduleDraft({ date: '2026-08-14', time: '24:00', capacity: '100' }, [], null)
    ).toHaveProperty('error');
    expect(
      validateScheduleDraft({ date: '2026-08-14', time: '19:60', capacity: '100' }, [], null)
    ).toHaveProperty('error');
  });

  it('빈 정원은 0으로 통과하지 않는다', () => {
    // Number('')는 0이라 그냥 두면 "정원 0석 회차"가 조용히 저장된다
    const result = validateScheduleDraft({ date: '2026-08-14', time: '19:30', capacity: '' }, [], null);

    expect(result).toHaveProperty('error');
  });

  it('음수 정원과 소수점 정원은 걸린다', () => {
    expect(
      validateScheduleDraft({ date: '2026-08-14', time: '19:30', capacity: '-1' }, [], null)
    ).toHaveProperty('error');
    expect(
      validateScheduleDraft({ date: '2026-08-14', time: '19:30', capacity: '10.5' }, [], null)
    ).toHaveProperty('error');
  });
});

describe('validateScheduleDraft — 정원은 이미 판 매수 아래로 못 내린다', () => {
  const 세장팔린회차 = makeSchedule('s1', '2026-08-14T19:30:00', { capacity: 100, soldCount: 3 });

  it('판 매수보다 적게 적으면 막는다', () => {
    const result = validateScheduleDraft(
      { date: '2026-08-14', time: '19:30', capacity: '2' },
      [세장팔린회차],
      세장팔린회차
    );

    expect(result).toHaveProperty('error');
  });

  it('판 매수와 같은 값은 된다 — 더 팔지 않겠다는 뜻이라 실제로 쓰는 방법이다', () => {
    const result = validateScheduleDraft(
      { date: '2026-08-14', time: '19:30', capacity: '3' },
      [세장팔린회차],
      세장팔린회차
    );

    expect(result).toHaveProperty('input');
  });
});

describe('validateScheduleDraft — 같은 시각 회차', () => {
  it('이미 있는 회차와 같은 시각으로 새로 만들면 막는다', () => {
    const result = validateScheduleDraft(
      { date: '2026-08-14', time: '19:30', capacity: '100' },
      [회차],
      null
    );

    expect(result).toHaveProperty('error');
  });

  it('자기 자신과 같은 시각인 건 막지 않는다 — 시각은 그대로 두고 정원만 고치는 경우', () => {
    const result = validateScheduleDraft(
      { date: '2026-08-14', time: '19:30', capacity: '200' },
      [회차],
      회차
    );

    expect(result).toHaveProperty('input');
  });

  it('날짜가 같아도 시각이 다르면 만들 수 있다 — 같은 날 낮 공연·저녁 공연', () => {
    const result = validateScheduleDraft(
      { date: '2026-08-14', time: '14:00', capacity: '100' },
      [회차],
      null
    );

    expect(result).toHaveProperty('input');
  });
});
