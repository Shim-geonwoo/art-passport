// 회차 입력 검증 테스트
//
// 회차를 저장하기 전에 화면이 값을 검사한다. 서버도 일부는 막지만(정원 음수), 나머지는
// **DB에 막을 방법이 없어서 여기서만 걸린다.** 그래서 이 검사가 곧 규칙 그 자체다:
//
//   - 정원을 이미 판 매수보다 낮추면 → 취소해도 자리가 안 열리고 잔여석이 음수가 된다
//   - 같은 시각 회차가 둘이면   → 예매 화면에 똑같이 생긴 줄이 두 개 뜬다
//
// 화면 없이 확인할 수 있도록 순수 함수로 떼어놨고, 여기서 그 함수만 부른다.

import { MAX_REPEAT_DAYS, expandScheduleDraft, validateScheduleDraft } from '@/data/admin';
import type { AdminScheduleItem } from '@/data/admin';
import { formatDateInput, formatTimeInput } from '@/data/schedule';

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

// 관리자 화면의 날짜·시각 칸은 숫자만 받고 구분자를 자동으로 넣는다.
// 지울 때 구분자가 도로 붙으면 한 글자도 못 지우게 되므로 그 방향을 특히 확인한다.
describe('입력 마스크 — 숫자만 치면 구분자가 들어간다', () => {
  it('숫자를 치는 대로 - 가 들어간다', () => {
    expect(formatDateInput('2026')).toBe('2026');
    expect(formatDateInput('20260')).toBe('2026-0');
    expect(formatDateInput('202608')).toBe('2026-08');
    expect(formatDateInput('20260814')).toBe('2026-08-14');
  });

  it('지울 때 - 가 다시 붙지 않는다', () => {
    // 사용자가 '2026-08'에서 백스페이스를 누르면 '2026-0'이 들어온다.
    // 숫자가 5개라 '-'를 유지하고, 한 번 더 지우면 '2026-'이 들어와 '-'가 사라진다.
    expect(formatDateInput('2026-0')).toBe('2026-0');
    expect(formatDateInput('2026-')).toBe('2026');
  });

  it('구분자가 무엇이든 붙여넣으면 같은 결과가 된다', () => {
    expect(formatDateInput('2026-08-14')).toBe('2026-08-14');
    expect(formatDateInput('2026.08.14')).toBe('2026-08-14');
    expect(formatDateInput('2026/08/14')).toBe('2026-08-14');
  });

  it('0을 안 채운 글을 붙여넣으면 어긋난다 — 숫자만 남기므로 복원할 수 없다', () => {
    // '2026년 8월 14일'은 숫자가 7개(2026814)뿐이라 월이 한 자리인지 두 자리인지 알 수 없다.
    // 이대로 두는 이유: 어긋난 값은 화면에 그대로 보이고, 저장할 때 parseDateKey가 걸러낸다.
    // 붙여넣기를 되살리려고 규칙을 늘리면 정작 흔한 경우(숫자만 치기)가 복잡해진다.
    expect(formatDateInput('2026년 8월 14일')).toBe('2026-81-4');
  });

  it('여덟 자리를 넘으면 잘라낸다', () => {
    expect(formatDateInput('202608149999')).toBe('2026-08-14');
  });

  it('시각도 같은 방식이다', () => {
    expect(formatTimeInput('19')).toBe('19');
    expect(formatTimeInput('1930')).toBe('19:30');
    expect(formatTimeInput('19:3')).toBe('19:3');
    expect(formatTimeInput('19:')).toBe('19');
    expect(formatTimeInput('193045')).toBe('19:30');
  });
});

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

// 회차 반복 추가 — "이 시각으로 며칠간"
//
// 공연 회차는 보통 며칠씩 이어진다(시드도 공연당 9회차다). 하나씩 만들면 날짜만 바꿔가며 같은
// 동작을 반복하게 되는데, 그건 사람이 아니라 기계가 할 일이다.
describe('expandScheduleDraft — 며칠간 반복', () => {
  const 기본 = { date: '2026-08-14', time: '19:30', capacity: '100' };

  it('1일이면 한 건만 나온다 — 반복을 안 쓴 것과 같다', () => {
    const result = expandScheduleDraft(기본, '1', []);

    expect(result).toEqual({ inputs: [{ startsAt: new Date('2026-08-14T19:30:00'), capacity: 100 }], skipped: 0 });
  });

  it('7일이면 그날부터 이레치가 같은 시각·같은 정원으로 나온다', () => {
    const result = expandScheduleDraft(기본, '7', []);
    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.inputs).toHaveLength(7);
    expect(result.inputs[0].startsAt).toEqual(new Date('2026-08-14T19:30:00'));
    expect(result.inputs[6].startsAt).toEqual(new Date('2026-08-20T19:30:00'));
    expect(result.inputs.every((i) => i.capacity === 100)).toBe(true);
  });

  it('달을 넘어가도 날짜가 이어진다', () => {
    const result = expandScheduleDraft({ ...기본, date: '2026-08-30' }, '3', []);
    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.inputs[2].startsAt).toEqual(new Date('2026-09-01T19:30:00'));
  });

  it('이미 있는 시각은 건너뛰고 몇 개를 건너뛰었는지 알려준다', () => {
    // 월·수·금만 있는 공연에 7일 반복을 걸어 빈 날을 채우는 식으로 쓸 수 있어야 한다.
    // 하나라도 겹친다고 통째로 거절하면, 그때마다 사람이 겹치는 날을 찾아내야 한다.
    const result = expandScheduleDraft(기본, '3', [
      makeSchedule('s1', '2026-08-15T19:30:00'),
    ]);
    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.inputs).toHaveLength(2); // 14일, 16일
    expect(result.skipped).toBe(1); // 15일
  });

  it('첫날이 이미 있으면 반복 자체가 막힌다 — 시작점을 못 잡는다', () => {
    const result = expandScheduleDraft(기본, '7', [makeSchedule('s1', '2026-08-14T19:30:00')]);

    expect(result).toHaveProperty('error');
  });

  it('0일이나 빈 값은 막는다', () => {
    expect(expandScheduleDraft(기본, '0', [])).toHaveProperty('error');
    expect(expandScheduleDraft(기본, '', [])).toHaveProperty('error');
    expect(expandScheduleDraft(기본, '3.5', [])).toHaveProperty('error');
  });

  it('상한을 넘으면 막는다 — 365를 잘못 넣으면 되돌리는 데 훨씬 오래 걸린다', () => {
    expect(expandScheduleDraft(기본, String(MAX_REPEAT_DAYS), [])).toHaveProperty('inputs');
    expect(expandScheduleDraft(기본, String(MAX_REPEAT_DAYS + 1), [])).toHaveProperty('error');
  });

  it('첫날 검사는 평소와 같다 — 형식이 틀리면 반복 이전에 걸린다', () => {
    expect(expandScheduleDraft({ ...기본, date: '2026-02-31' }, '7', [])).toHaveProperty('error');
    expect(expandScheduleDraft({ ...기본, capacity: '' }, '7', [])).toHaveProperty('error');
  });
});
