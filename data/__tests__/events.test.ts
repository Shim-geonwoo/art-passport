// 파는 방식 판정 테스트 — 회차 유무가 종류를 정한다
//
// 이 규칙은 세 곳에 걸쳐 있고, 셋이 어긋나면 사용자가 곧바로 다친다:
//
//   create_booking()      서버가 실제로 무엇을 요구하는가 (회차 id인가, 관람 날짜인가)
//   isBookable()          목록·상세가 "예매 가능"을 보여줄지
//   catalogVisibility()   관리자에게 "왜 예매 탭에 안 보이는지"를 뭐라고 말할지
//
// 화면이 "예매 가능"이라고 했는데 서버가 거절하면 누른 사람은 앱이 고장 난 줄 안다.
// 그래서 앱 쪽 두 함수가 서버와 같은 순서로 가르는지를 여기서 못박는다.
// (서버 쪽은 supabase/tests/create_booking_test.sql이 진짜 Postgres에서 확인한다)

import { catalogVisibility } from '@/data/admin';
import type { AdminEventItem } from '@/data/admin';
import { formatEventSchedule, isBookable, isPeriodBased, isSessionBased } from '@/data/events';
import type { EventItem, EventSchedule } from '@/data/events';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-08-07T12:00:00');

function makeSchedule(startsAt: string, overrides: Partial<EventSchedule> = {}): EventSchedule {
  return {
    id: `sch-${startsAt}`,
    startsAt: new Date(startsAt),
    capacity: 100,
    soldCount: 0,
    remaining: 100,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'event-1',
    title: '테스트',
    genre: '전시',
    venueName: '테스트 미술관',
    price: 20000,
    showAt: new Date('2026-08-01T19:00:00'),
    showEndAt: null,
    posterUrl: null,
    description: null,
    schedules: [],
    ...overrides,
  };
}

function makeAdminEvent(overrides: Partial<AdminEventItem> = {}): AdminEventItem {
  return {
    id: 'event-1',
    title: '테스트',
    genre: '전시',
    venueName: '테스트 미술관',
    price: 20000,
    showAt: new Date('2026-08-01T19:00:00'),
    showEndAt: null,
    posterUrl: null,
    description: null,
    isHidden: false,
    scheduleCount: 0,
    upcomingScheduleCount: 0,
    ...overrides,
  };
}

describe('회차가 있으면 회차형이다', () => {
  it('종료일이 있어도 회차가 있으면 회차형 — 시간지정 입장 전시', () => {
    const event = makeEvent({
      showEndAt: new Date('2026-09-30T19:00:00'),
      schedules: [makeSchedule('2026-08-20T14:00:00')],
    });

    expect(isSessionBased(event)).toBe(true);
    expect(isPeriodBased(event)).toBe(false);
  });

  it('회차가 없고 종료일이 있으면 기간형', () => {
    const event = makeEvent({ showEndAt: new Date('2026-09-30T19:00:00') });

    expect(isSessionBased(event)).toBe(false);
    expect(isPeriodBased(event)).toBe(true);
  });

  it('회차도 종료일도 없으면 둘 다 아니다 — 아직 팔 방법이 없는 상태', () => {
    const event = makeEvent();

    expect(isSessionBased(event)).toBe(false);
    expect(isPeriodBased(event)).toBe(false);
  });
});

describe('isBookable — 서버와 같은 순서로 가른다', () => {
  it('회차가 있는 전시는 회차 쪽으로 판단한다 — 기간이 남아도 회차가 다 지났으면 못 산다', () => {
    // 종료일은 한참 뒤인데 회차는 이미 지난 경우. 종료일을 먼저 보면 "예매 가능"이 되지만,
    // 서버는 회차를 요구하고 그 회차는 이미 지나서 거절한다.
    const event = makeEvent({
      showEndAt: new Date('2026-09-30T19:00:00'),
      schedules: [makeSchedule('2026-08-01T14:00:00')],
    });

    expect(isBookable(event, NOW)).toBe(false);
  });

  it('회차가 있는 전시는 남은 회차가 있으면 살 수 있다', () => {
    const event = makeEvent({
      showEndAt: new Date('2026-09-30T19:00:00'),
      schedules: [makeSchedule('2026-08-20T14:00:00')],
    });

    expect(isBookable(event, NOW)).toBe(true);
  });

  it('회차가 전부 매진이면 못 산다', () => {
    const event = makeEvent({
      schedules: [makeSchedule('2026-08-20T14:00:00', { soldCount: 100, remaining: 0 })],
    });

    expect(isBookable(event, NOW)).toBe(false);
  });

  it('회차 없는 전시는 종료일로 판단한다', () => {
    expect(isBookable(makeEvent({ showEndAt: new Date('2026-09-30T19:00:00') }), NOW)).toBe(true);
    expect(isBookable(makeEvent({ showEndAt: new Date('2026-08-01T19:00:00') }), NOW)).toBe(false);
  });

  it('회차도 종료일도 없으면 못 산다', () => {
    expect(isBookable(makeEvent(), NOW)).toBe(false);
  });
});

describe('formatEventSchedule — 회차가 있으면 회차를 따라간다', () => {
  it('회차가 있는 전시는 기간이 아니라 회차 범위를 보여준다', () => {
    // 기간을 보여주면 카드에 적힌 날짜와 예매 화면에서 고를 수 있는 날짜가 어긋난다
    const event = makeEvent({
      showEndAt: new Date('2026-09-30T19:00:00'),
      schedules: [makeSchedule('2026-08-20T14:00:00'), makeSchedule('2026-08-22T14:00:00')],
    });

    expect(formatEventSchedule(event)).toBe('2026.08.20 ~ 2026.08.22');
  });

  it('회차가 하나면 그 회차의 날짜와 시각을 보여준다', () => {
    const event = makeEvent({ schedules: [makeSchedule('2026-08-20T14:00:00')] });

    expect(formatEventSchedule(event)).toBe('2026.08.20 14:00');
  });

  it('회차가 없으면 기간을 보여준다', () => {
    const event = makeEvent({ showEndAt: new Date('2026-09-30T19:00:00') });

    expect(formatEventSchedule(event)).toBe('2026.08.01 ~ 2026.09.30');
  });
});

describe('catalogVisibility — 안 보이는 이유를 같은 순서로 답한다', () => {
  it('숨긴 것이 가장 먼저다', () => {
    const event = makeAdminEvent({ isHidden: true, scheduleCount: 3, upcomingScheduleCount: 3 });

    expect(catalogVisibility(event, NOW)).toEqual({ visible: false, reason: '숨김' });
  });

  it('회차가 있는 전시는 종료일이 남아도 회차로 판단한다', () => {
    const event = makeAdminEvent({
      showEndAt: new Date('2026-09-30T19:00:00'),
      scheduleCount: 3,
      upcomingScheduleCount: 0,
    });

    expect(catalogVisibility(event, NOW)).toEqual({ visible: false, reason: '남은 회차 없음' });
  });

  it('회차 없는 전시는 종료일로 판단한다', () => {
    const 진행중 = makeAdminEvent({ showEndAt: new Date('2026-09-30T19:00:00') });
    const 끝남 = makeAdminEvent({ showEndAt: new Date('2026-08-01T19:00:00') });

    expect(catalogVisibility(진행중, NOW)).toEqual({ visible: true, reason: null });
    expect(catalogVisibility(끝남, NOW)).toEqual({ visible: false, reason: '전시 종료' });
  });

  it('회차도 종료일도 없으면 회차 없음이라고 답한다', () => {
    expect(catalogVisibility(makeAdminEvent(), NOW)).toEqual({
      visible: false,
      reason: '회차 없음',
    });
  });
});
