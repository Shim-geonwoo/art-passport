// 한 달짜리 달력 — 관람일을 고를 때 쓴다. 전시·공연 둘 다 이걸로 날짜를 먼저 고른다.
//
// 외부 달력 라이브러리를 새로 넣지 않고 필요한 만큼만 직접 그린다(고를 수 있는 범위가
// 전시 기간/공연 기간으로 정해져 있어서, 범용 달력만큼 복잡할 이유가 없다).
//
// 두 가지 방식을 한 컴포넌트로 처리한다:
//  - 전시: minDate~maxDate 사이 아무 날이나 (availableDates를 안 넘긴다)
//  - 공연: 회차가 있는 날만 (availableDates에 그 날짜들을 넘긴다)

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { isSameDay, startOfDay, toDateKey, WEEKDAY_LABELS } from '@/data/schedule';

type Props = {
  minDate: Date; // 이 날부터 고를 수 있다
  maxDate: Date; // 이 날까지 고를 수 있다
  selected: Date | null;
  onSelect: (date: Date) => void;
  theme: ThemeColors;
  // 있으면 이 날짜들만 고를 수 있다 (toDateKey 형식 'YYYY-MM-DD').
  // 공연처럼 "회차가 있는 날만" 골라야 할 때 넘긴다. 안 넘기면 범위 안 모든 날을 고를 수 있다.
  availableDates?: Set<string>;
};

// 그 달의 1일 (달을 넘길 때 기준점으로 쓴다)
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// 이 달에 그릴 칸들을 만든다.
// 1일이 무슨 요일인지에 따라 앞을 빈칸(null)으로 채워야 요일 줄이 맞는다.
// 예) 1일이 수요일이면 앞에 빈칸 3개(일·월·화)를 넣고 1일을 시작한다.
function buildMonthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return cells;
}

export function DateCalendar({
  minDate,
  maxDate,
  selected,
  onSelect,
  theme,
  availableDates,
}: Props) {
  // 처음 펼칠 달: 이미 고른 날이 있으면 그 달, 없으면 고를 수 있는 첫 달
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected ?? minDate));

  const cells = buildMonthCells(visibleMonth);

  // 앞뒤로 더 넘길 달이 있는지 (전시 기간을 벗어나면 화살표를 흐리게 하고 막는다)
  const canGoPrev = startOfMonth(visibleMonth) > startOfMonth(minDate);
  const canGoNext = startOfMonth(visibleMonth) < startOfMonth(maxDate);

  function moveMonth(delta: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.emptyCellBackground }]}>
      {/* 달 이동 헤더: ‹ 2026년 8월 › */}
      <View style={styles.header}>
        <ArrowButton label="‹" disabled={!canGoPrev} onPress={() => moveMonth(-1)} theme={theme} />
        <Text style={[styles.monthLabel, { color: theme.text }]}>
          {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
        </Text>
        <ArrowButton label="›" disabled={!canGoNext} onPress={() => moveMonth(1)} theme={theme} />
      </View>

      {/* 요일 줄 (일~토) */}
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <Text style={[styles.weekdayText, { color: theme.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* 날짜 칸들. 7개씩 줄바꿈되도록 감싼다 */}
      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (!date) {
            // 1일 앞의 빈칸 — 누를 수 없고 아무것도 안 그린다
            return <View key={`empty-${index}`} style={styles.cell} />;
          }

          // 고를 수 있는 날인가: ① 정해진 기간 안이고 ② (공연이면) 그날 회차가 있는가.
          // 시각은 빼고 날짜끼리만 비교한다.
          const inRange =
            date.getTime() >= startOfDay(minDate).getTime() &&
            date.getTime() <= startOfDay(maxDate).getTime();
          const selectable = inRange && (!availableDates || availableDates.has(toDateKey(date)));
          const isSelected = !!selected && isSameDay(date, selected);

          return (
            <Pressable
              key={date.toISOString()}
              style={styles.cell}
              disabled={!selectable}
              onPress={() => onSelect(date)}>
              <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                <Text
                  style={[
                    styles.dayText,
                    { color: theme.text },
                    !selectable && styles.dayTextDisabled,
                    isSelected && styles.dayTextSelected,
                  ]}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

    </View>
  );
}

// ‹ › 달 이동 버튼
function ArrowButton({
  label,
  disabled,
  onPress,
  theme,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  theme: ThemeColors;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={disabled && styles.arrowDisabled}>
      <Text style={[styles.arrowText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16, // radius-card
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  monthLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  arrowText: {
    fontFamily: Fonts.medium,
    fontSize: 22,
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  arrowDisabled: {
    opacity: 0.25,
  },

  weekRow: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // 7칸이 한 줄에 딱 맞게 (100 / 7)
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  weekdayText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    paddingVertical: 4,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Colors.gold, // 고른 날만 골드 (포인트색은 소량만)
  },
  dayText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  dayTextDisabled: {
    opacity: 0.25,
  },
  dayTextSelected: {
    fontFamily: Fonts.medium,
    color: Colors.textOnColor,
  },
});
