// 마이페이지 > 관리자 > 공연 편집 (하위 화면)
//
// 목록에서 공연을 누르면 오는 화면이고, id 없이 들어오면 "새 공연 등록"이 된다.
// 두 경우가 채우는 칸이 똑같아서 화면을 나누지 않았다 — 다른 건 처음 값이 비어 있는지뿐이다.
//
// 여기서 B2(카탈로그 콘텐츠)가 풀린다. 시드 50건은 소개글이 전부 비어 있고 포스터도 임시
// 이미지라, 이 화면이 그걸 채우는 자리다.
//
// 공연(회차형)과 전시(기간형)를 종료일 유무로 가른다. 이 한 칸이 앱 전체의 분기를 만들어서
// (회차를 쓸지, 관람일을 고르게 할지, 정원이 있는지) 화면에서도 제일 위에 두고 분명히 보여준다.

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { CategoryColors, Colors, Genre, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useEvents } from '@/contexts/events';
import {
  AdminEventInput,
  AdminEventItem,
  createAdminEvent,
  fetchAdminEvent,
  fetchAdminSchedules,
  removePoster,
  setEventHidden,
  updateAdminEvent,
  uploadPoster,
} from '@/data/admin';
import { parseDateKey, toDateKey } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';

const GENRES: Genre[] = ['전시', '클래식·무용', '콘서트', '연극', '뮤지컬'];

// 안내/실패 알림. 웹에서는 Alert.alert가 아무 일도 안 해서 window.alert로 대신한다.
// (app/(tabs)/mypage/profile.tsx와 같은 처리)
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

// 이 화면은 날짜만 받고 시각은 안 받는다. events.show_at은 "며칠부터 하는 공연인가"를 나타내고,
// 실제 관람 시각은 회차(event_schedules)가 들고 있기 때문이다.
// 그래도 timestamp 칸이라 시각이 필요해서, 저녁 공연이 가장 흔한 점을 따라 19:00으로 채운다.
const DEFAULT_HOUR = '19:00';

// 날짜 칸에 친 글자를 'YYYY-MM-DD' 모양으로 다듬는다. 숫자만 치면 '-'가 알아서 들어간다.
//
// 왜 필요한가: 관리자는 날짜를 문서에서 옮겨 적는데, 그때 손이 치는 건 숫자 8개다.
// '-'를 직접 치게 하면 자판을 오가야 하고(모바일에서는 숫자판에 '-'가 없는 경우도 있다),
// 빠뜨리면 저장할 때가 되어서야 형식이 틀렸다고 걸린다.
//
// 숫자가 아닌 글자는 전부 버린다. 그래서 붙여넣기('2026-08-14', '2026.08.14')도 같은 결과가 되고,
// 지울 때는 '-'가 다시 붙지 않는다 — 숫자가 그만큼 남아 있을 때만 넣기 때문이다.
function formatDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8); // YYYYMMDD = 8자리
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function AdminEventEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { isAdmin } = useAuth();
  // 저장하면 예매 탭 카탈로그도 달라져야 한다. 전역 목록을 다시 받아오게 한다.
  const { refresh: refreshCatalog } = useEvents();

  const [loaded, setLoaded] = useState<AdminEventItem | null>(null);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 입력값
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<Genre>('뮤지컬');
  const [venueName, setVenueName] = useState('');
  const [price, setPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(''); // 비어 있으면 공연(회차형)
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);

  // 회차 수는 아래 loaded에도 들어 있지만 따로 들고 있는다.
  // 회차 화면에서 회차를 추가하고 돌아오면 loaded는 옛날 값이라, 방금 만든 회차가 없는 것처럼
  // 보인다. 그렇다고 돌아올 때마다 공연 전체를 다시 불러오면 고치던 입력칸이 되돌아간다 —
  // 그래서 되돌아가도 되는 이 값만 따로 다시 센다.
  const [scheduleCount, setScheduleCount] = useState<number | null>(null);

  // 기존 공연이면 값을 불러와 칸을 채운다
  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    fetchAdminEvent(id)
      .then((event) => {
        if (cancelled || !event) {
          return;
        }
        setLoaded(event);
        setTitle(event.title);
        setGenre(event.genre);
        setVenueName(event.venueName);
        setPrice(String(event.price));
        setStartDate(toDateKey(event.showAt));
        setEndDate(event.showEndAt ? toDateKey(event.showEndAt) : '');
        setDescription(event.description ?? '');
        setPosterUrl(event.posterUrl);
        setIsHidden(event.isHidden);
      })
      .catch(() => {
        notify('불러오기 실패', '공연 정보를 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // 회차 화면에 다녀올 때마다 회차 수를 다시 센다.
  useFocusEffect(
    useCallback(() => {
      if (!id) {
        return;
      }
      fetchAdminSchedules(id)
        .then((schedules) => setScheduleCount(schedules.length))
        .catch(() => {
          // 못 세면 개수를 안 보여줄 뿐이다. 이것 때문에 편집 화면을 막을 이유는 없다.
        });
    }, [id])
  );

  // 저장 전에 값을 검사해서, 문제가 있으면 무엇이 문제인지 돌려준다.
  // 서버도 같은 것을 막지만(가격 음수 등 제약), 저장을 눌러야 알게 되는 건 헛걸음이다.
  function validate(): { input: AdminEventInput } | { error: string } {
    if (title.trim().length === 0) {
      return { error: '공연·전시 이름을 입력해주세요.' };
    }
    if (venueName.trim().length === 0) {
      return { error: '장소를 입력해주세요.' };
    }

    const priceNumber = Number(price);
    if (!Number.isInteger(priceNumber) || priceNumber < 0) {
      return { error: '가격은 0 이상의 숫자로 입력해주세요.' };
    }

    const showAt = parseDateKey(startDate, DEFAULT_HOUR);
    if (!showAt) {
      return { error: '시작일을 2026-08-14 형식으로 입력해주세요.' };
    }

    // 종료일은 비워둘 수 있다(= 공연). 적었다면 형식과 순서를 본다.
    let showEndAt: Date | null = null;
    if (endDate.trim().length > 0) {
      showEndAt = parseDateKey(endDate, DEFAULT_HOUR);
      if (!showEndAt) {
        return { error: '종료일을 2026-09-30 형식으로 입력해주세요.' };
      }
      if (showEndAt.getTime() < showAt.getTime()) {
        return { error: '종료일이 시작일보다 빠를 수 없어요.' };
      }
    }

    return {
      input: { title, genre, venueName, price: priceNumber, showAt, showEndAt, description },
    };
  }

  const handleSave = useCallback(async () => {
    const result = validate();
    if ('error' in result) {
      notify('저장할 수 없어요', result.error);
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        const newId = await createAdminEvent(result.input);
        await refreshCatalog();
        // 새로 만든 것은 회차가 하나도 없다. 종료일을 적었으면 기간형으로 곧장 팔리지만,
        // 안 적었으면 파는 방법이 없어서 예매 탭에 안 뜬다 — 목록으로 돌아가 '회차 없음' 뱃지를
        // 보고서야 알게 되면 등록이 실패한 줄 안다.
        notify(
          '등록했어요',
          result.input.showEndAt
            ? '등록됐어요. 기간 안에서 관람일을 고르는 방식으로 팔려요.'
            : '등록됐어요. 회차를 추가해야 예매 탭에 보입니다.'
        );
        // 방금 만든 공연의 편집 화면으로 갈아탄다(뒤로가기가 빈 등록 화면으로 돌아가지 않게)
        router.replace({ pathname: '/mypage/admin-event', params: { id: newId } });
      } else {
        await updateAdminEvent(id!, result.input);
        await refreshCatalog();
        notify('저장했어요', '변경 내용이 반영됐어요.');
      }
    } catch {
      // 관리자가 아니면 서버가 여기서 거절한다(RLS). 화면을 감추는 것과 별개로 실제 차단은 DB가 한다.
      notify('저장 실패', isAdmin ? '저장하지 못했어요. 잠시 후 다시 시도해주세요.' : '관리자만 저장할 수 있어요.');
    } finally {
      setIsSaving(false);
    }
    // validate는 매 렌더 새로 만들어지는 함수라 deps에 넣지 않는다(넣으면 매번 다시 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, id, title, genre, venueName, price, startDate, endDate, description, isAdmin, refreshCatalog]);

  // 포스터 고르기 → 올리기. 프로필 사진과 같은 흐름이고, 비율만 포스터에 맞춘다.
  const handlePickPoster = useCallback(async () => {
    if (!id) {
      notify('먼저 저장해주세요', '포스터는 공연을 등록한 뒤에 올릴 수 있어요.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('사진 접근 권한이 필요해요', '설정에서 사진 접근을 허용한 뒤 다시 시도해주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5], // 카탈로그 포스터 자리와 같은 비율 (시드 이미지도 400x500이었다)
      quality: 0.8, // 포스터는 목록에서 크게 보여서 프로필 사진보다 조금 높게 잡는다
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.base64) {
      return;
    }

    setIsUploading(true);
    try {
      const asset = result.assets[0];
      const url = await uploadPoster(id, asset.base64!, asset.mimeType ?? 'image/jpeg');
      setPosterUrl(url);
      await refreshCatalog();
    } catch {
      notify('업로드 실패', isAdmin ? '포스터를 올리지 못했어요.' : '관리자만 포스터를 올릴 수 있어요.');
    } finally {
      setIsUploading(false);
    }
  }, [id, isAdmin, refreshCatalog]);

  const handleRemovePoster = useCallback(async () => {
    if (!id) {
      return;
    }
    setIsUploading(true);
    try {
      await removePoster(id);
      setPosterUrl(null);
      await refreshCatalog();
    } catch {
      notify('삭제 실패', '포스터를 지우지 못했어요.');
    } finally {
      setIsUploading(false);
    }
  }, [id, refreshCatalog]);

  const handleToggleHidden = useCallback(async () => {
    if (!id) {
      return;
    }
    const next = !isHidden;
    try {
      await setEventHidden(id, next);
      setIsHidden(next);
      await refreshCatalog();
    } catch {
      notify('변경 실패', isHidden ? '다시 올리지 못했어요.' : '내리지 못했어요.');
    }
  }, [id, isHidden, refreshCatalog]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="공연 편집" color={theme.text} />
        <ActivityIndicator style={styles.loading} color={theme.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!isNew && !loaded) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="공연 편집" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  // 지금 이 공연이 팔리는 방식. data/events.ts의 isSessionBased / isPeriodBased와 같은 순서다.
  //
  // 회차 수는 저장된 값(scheduleCount)을 보고, 종료일은 아직 저장 안 한 입력칸을 본다.
  // 종료일을 지우자마자 아래 안내가 따라 바뀌어야 하기 때문이다 — 저장해야 알 수 있으면
  // 무엇이 달라지는지 모른 채로 저장하게 된다.
  const sellingMode: 'session' | 'period' | 'none' =
    scheduleCount !== null && scheduleCount > 0
      ? 'session'
      : endDate.trim().length > 0
        ? 'period'
        : 'none';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title={isNew ? '새 공연 등록' : '공연 편집'} color={theme.text} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 포스터. 새 공연은 아직 id가 없어서 저장 후에 올릴 수 있다 */}
        <View style={styles.posterBlock}>
          <View style={[styles.poster, { backgroundColor: CategoryColors[genre] }]}>
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.posterImage} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={40} color={Colors.textOnColor} />
            )}
            {isUploading ? (
              <View style={styles.posterOverlay}>
                <ActivityIndicator color={Colors.textOnColor} />
              </View>
            ) : null}
          </View>

          <View style={styles.posterButtons}>
            <SmallButton
              label={posterUrl ? '포스터 바꾸기' : '포스터 올리기'}
              onPress={handlePickPoster}
              disabled={isUploading}
              theme={theme}
            />
            {posterUrl ? (
              <SmallButton
                label="지우기"
                onPress={handleRemovePoster}
                disabled={isUploading}
                theme={theme}
                tone="quiet"
              />
            ) : null}
            {isNew ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                저장한 뒤에 올릴 수 있어요
              </Text>
            ) : null}
          </View>
        </View>

        {/* 지금 이 공연이 어떻게 팔리는가.
            회차가 있으면 회차형, 없고 종료일이 있으면 기간형, 둘 다 없으면 아직 못 판다.
            장르나 종료일이 아니라 회차 유무가 정한다(create_booking도 같은 순서로 가른다) */}
        <View style={[styles.typeCard, { backgroundColor: theme.emptyCellBackground }]}>
          <Text style={[styles.typeLabel, { color: theme.text }]}>
            {sellingMode === 'session'
              ? '회차형 — 회차를 골라서 산다'
              : sellingMode === 'period'
                ? '기간형 — 기간 안에서 관람일을 고른다'
                : '아직 팔 수 없음'}
          </Text>
          <Text style={[styles.typeHint, { color: theme.textSecondary }]}>
            {sellingMode === 'session'
              ? '회차마다 정원이 있다. 회차를 전부 지우면 기간형으로 돌아간다.'
              : sellingMode === 'period'
                ? '정원이 없어 무제한으로 팔린다. 회차를 만들면 시간을 지정해 파는 방식이 된다.'
                : '회차를 만들거나 종료일을 적어야 예매 탭에 보인다.'}
          </Text>
        </View>

        <Field label="이름" value={title} onChangeText={setTitle} theme={theme} placeholder="레베카" />

        {/* 장르: 카테고리 색이 카드·스탬프에 그대로 쓰이므로 고르는 자리에서도 색을 보여준다 */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>장르</Text>
        <View style={styles.genreRow}>
          {GENRES.map((g) => (
            <Pressable
              key={g}
              onPress={() => setGenre(g)}
              style={[
                styles.genreChip,
                {
                  backgroundColor: g === genre ? CategoryColors[g] : 'transparent',
                  borderColor: g === genre ? CategoryColors[g] : theme.dashedBorder,
                },
              ]}>
              <Text
                style={[
                  styles.genreChipText,
                  { color: g === genre ? Colors.textOnColor : theme.textSecondary },
                ]}
                numberOfLines={1}>
                {g}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          label="장소"
          value={venueName}
          onChangeText={setVenueName}
          theme={theme}
          placeholder="블루스퀘어"
        />
        <Field
          label="가격 (원)"
          value={price}
          onChangeText={setPrice}
          theme={theme}
          placeholder="120000"
          keyboardType="number-pad"
        />
        {/* 날짜 두 칸은 숫자만 받는다 — '-'는 formatDateInput이 넣는다 */}
        <Field
          label="시작일"
          value={startDate}
          onChangeText={(text) => setStartDate(formatDateInput(text))}
          theme={theme}
          placeholder="20260814 → 2026-08-14"
          keyboardType="number-pad"
        />
        <Field
          label="종료일 (전시만)"
          value={endDate}
          onChangeText={(text) => setEndDate(formatDateInput(text))}
          theme={theme}
          placeholder="비우면 공연"
          keyboardType="number-pad"
        />

        {/* 소개글. 시드 50건이 전부 비어 있어서 상세 화면에 "준비 중"만 뜬다 — 여기가 그걸 채우는 자리 */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>소개글</Text>
        <TextInput
          style={[
            styles.textArea,
            { color: theme.text, borderColor: theme.dashedBorder, backgroundColor: theme.emptyCellBackground },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="공연 상세 화면에 보여줄 소개글"
          placeholderTextColor={theme.textSecondary}
          multiline
          textAlignVertical="top"
        />

        {/* 카탈로그에서 내리기/올리기. 삭제 버튼은 두지 않는다 — DB도 삭제를 막아 뒀다 */}
        {!isNew ? (
          <View style={[styles.hiddenCard, { backgroundColor: theme.emptyCellBackground }]}>
            <View style={styles.hiddenText}>
              <Text style={[styles.hiddenTitle, { color: theme.text }]}>
                {isHidden ? '카탈로그에서 내려둔 상태' : '카탈로그에 올라가 있음'}
              </Text>
              <Text style={[styles.hiddenHint, { color: theme.textSecondary }]}>
                내려도 이미 예매한 사람의 보딩패스·스탬프는 그대로 남아요. 공연은 삭제할 수 없어요.
              </Text>
            </View>
            <SmallButton
              label={isHidden ? '다시 올리기' : '내리기'}
              onPress={handleToggleHidden}
              theme={theme}
              tone={isHidden ? 'normal' : 'quiet'}
            />
          </View>
        ) : null}

        {/* 회차 관리로 가는 입구. 장르나 종료일과 무관하게 항상 둔다 —
            회차를 만드는 행위가 곧 파는 방식을 정하는 것이라, 전시에도 열려 있어야 한다.
            내리기 카드와 나란히 두고 저장 버튼을 그 아래에 둔다. 둘 다 "이 공연에 딸린 것"을
            다루는 줄이라 같은 자리에 모이는 편이 찾기 쉽다.
            다만 여기서 화면을 옮기면 아직 저장 안 한 입력이 사라지므로 문구에 적어둔다.
            새 공연만 예외다 — 아직 id가 없어서 회차를 붙일 곳이 없다 */}
        {!isNew ? (
          <Pressable
            style={[styles.linkCard, { backgroundColor: theme.emptyCellBackground }]}
            onPress={() => router.push({ pathname: '/mypage/admin-schedules', params: { id } })}
            accessibilityRole="button">
            <View style={styles.hiddenText}>
              <Text style={[styles.hiddenTitle, { color: theme.text }]}>
                회차 관리{scheduleCount === null ? '' : ` · ${scheduleCount}개`}
              </Text>
              <Text style={[styles.hiddenHint, { color: theme.textSecondary }]}>
                {sellingMode === 'session'
                  ? '회차 날짜·시각과 정원을 여기서 고쳐요. 저장하지 않은 내용은 사라져요.'
                  : sellingMode === 'period'
                    ? '회차를 만들면 시간을 지정해 파는 방식으로 바뀌어요.'
                    : '회차가 없어서 예매 탭에 안 보여요. 회차를 추가해주세요.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}>
          <Text style={styles.saveButtonText}>
            {isSaving ? '저장 중...' : isNew ? '등록하기' : '저장하기'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// 한 줄 입력칸 (라벨 + TextInput)
function Field({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: ThemeColors;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation';
}) {
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.dashedBorder, backgroundColor: theme.emptyCellBackground },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  theme,
  disabled,
  tone = 'normal',
}: {
  label: string;
  onPress: () => void;
  theme: ThemeColors;
  disabled?: boolean;
  tone?: 'normal' | 'quiet';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.smallButton,
        {
          borderColor: tone === 'quiet' ? theme.dashedBorder : Colors.navy,
          backgroundColor: tone === 'quiet' ? 'transparent' : Colors.navy,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <Text
        style={[
          styles.smallButtonText,
          { color: tone === 'quiet' ? theme.textSecondary : Colors.textOnColor },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  loading: {
    marginTop: 32,
  },
  notFound: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },

  // 포스터
  posterBlock: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  poster: {
    width: 96,
    height: 120, // 4:5 (카탈로그 포스터와 같은 비율)
    borderRadius: 10, // 보딩패스류 radius
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  posterButtons: {
    flex: 1,
    gap: 8,
    alignItems: 'flex-start',
  },

  // 종류 안내 카드
  typeCard: {
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  typeLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  typeHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },

  // 입력칸
  fieldLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
    borderWidth: 0.5,
    borderRadius: 10,
    padding: 12,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },

  // 장르 고르기
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  genreChip: {
    borderWidth: 0.5,
    borderRadius: 20, // radius-pill
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreChipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },

  // 내리기/올리기
  hiddenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
  },
  // 회차 관리로 가는 줄. 내리기 카드와 같은 모양이되 오른쪽 끝에 화살표를 둔다
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
  },
  hiddenText: {
    flex: 1,
    gap: 4,
  },
  hiddenTitle: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  hiddenHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },

  // 버튼
  smallButton: {
    borderWidth: 0.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  saveButton: {
    marginTop: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.textOnColor,
  },

  hint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
