// 마이페이지 > 예매관리 (하위 화면)
//
// 내 예매를 상태 필터와 검색으로 좁혀 보고, 항목을 누르면 예매 상세로 들어간다.
// 취소는 상세 화면에서 하며, 그 상태는 BookingsProvider를 통해 목록과 공유된다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { BookingStatus, deriveAllBookings, DerivedBooking } from '@/data/dummy-bookings';
import { formatDate, formatDateTime } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 상태 뱃지 색 (예매완료=파랑, 관람완료=네이비, 취소=회색)
const BOOKING_STATUS_COLOR: Record<BookingStatus, string> = {
  예매완료: Colors.blue,
  관람완료: Colors.navy,
  취소: Colors.textSecondary,
};

// 상태 필터 선택지 ('전체' + 세 가지 상태)
type StatusFilter = '전체' | BookingStatus;
const STATUS_FILTERS: StatusFilter[] = ['전체', '예매완료', '관람완료', '취소'];

export default function BookingsScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { bookings } = useBookings();
  const now = useNow();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [query, setQuery] = useState('');

  // 전체 목록을 관람일 늦은 순으로 정렬. (취소 여부는 deriveAllBookings가 이미 상태에 반영해 준다)
  const allBookings: DerivedBooking[] = deriveAllBookings(bookings, now).sort(
    (a, b) => b.showAt.getTime() - a.showAt.getTime()
  );

  // 상태 필터 + 검색어(제목/장소)로 좁힌다
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = allBookings.filter((booking) => {
    const statusOk = statusFilter === '전체' || booking.status === statusFilter;
    const searchOk =
      trimmedQuery === '' ||
      booking.event.title.toLowerCase().includes(trimmedQuery) ||
      booking.event.venueName.toLowerCase().includes(trimmedQuery);
    return statusOk && searchOk;
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="예매관리" color={theme.text} />

      {/* 상태 필터 칩 (가로 스크롤). 각 칩에 건수도 함께 보여준다 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chipRow}>
        {STATUS_FILTERS.map((status) => {
          const count =
            status === '전체'
              ? allBookings.length
              : allBookings.filter((b) => b.status === status).length;
          const selected = status === statusFilter;
          return (
            <Pressable
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[
                styles.chip,
                { borderColor: theme.dashedBorder },
                selected && { backgroundColor: Colors.navy, borderColor: Colors.navy },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? Colors.textOnColor : theme.textSecondary },
                ]}>
                {status} {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 검색창 (제목/장소) */}
      <View style={[styles.search, { borderColor: theme.dashedBorder }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="공연 제목 또는 장소 검색"
          placeholderTextColor={theme.textSecondary}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filtered.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>해당하는 예매가 없어요.</Text>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            {filtered.map((booking, index) => (
              <View key={booking.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: theme.dashedBorder }]} />}
                <BookingRow booking={booking} theme={theme} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 예매 한 줄: 누르면 예매 상세로 이동한다
function BookingRow({ booking, theme }: { booking: DerivedBooking; theme: ThemeColors }) {
  const whenText = booking.event.time ? formatDateTime(booking.showAt) : formatDate(booking.showAt);

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/mypage/booking-detail', params: { id: booking.id } })}>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {booking.event.title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{whenText}</Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{booking.event.venueName}</Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.badge, { backgroundColor: BOOKING_STATUS_COLOR[booking.status] }]}>
          <Text style={styles.badgeText}>{booking.status}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  // 상태 필터 칩
  chipBar: {
    flexGrow: 0, // 가로 ScrollView가 세로로 늘어나지 않게 고정
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center', // 칩이 세로로 늘어나 잘리지 않게 정렬
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },

  // 검색창
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  rowMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: Colors.textOnColor,
  },
});
