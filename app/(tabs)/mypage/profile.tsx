// 마이페이지 > 프로필 편집 (하위 화면)
//
// 지금은 닉네임만 고친다. (프로필 이미지는 Supabase Storage가 필요해서 다음 단계)
// 저장하면 public.users를 업데이트하고, AuthProvider의 프로필을 다시 불러와 앱 전체에 반영한다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { TextField } from '@/components/text-field';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { updateNickname } from '@/data/profile';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileEditScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { user, profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = nickname.trim();
  // 값이 없거나, 원래 닉네임과 똑같으면 저장할 게 없다
  const canSave = trimmed.length > 0 && trimmed !== profile?.nickname && !isSaving;

  async function handleSave() {
    if (!user || !canSave) {
      return;
    }
    setIsSaving(true);
    try {
      await updateNickname(user.id, trimmed);
      await refreshProfile();
      router.back();
    } catch {
      setIsSaving(false);
      const message = '닉네임을 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('저장 실패', message);
      }
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="프로필 편집" color={theme.text} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 아바타 자리 (프로필 이미지는 다음 단계 — Storage 연동 후) */}
        <View style={styles.avatarBlock}>
          <View style={[styles.avatar, { backgroundColor: theme.emptyCellBackground }]}>
            <Ionicons name="person-outline" size={36} color={theme.textSecondary} />
          </View>
        </View>

        <TextField
          label="닉네임"
          theme={theme}
          value={nickname}
          onChangeText={setNickname}
          placeholder="여권에 표시될 이름"
          maxLength={20}
        />

        {user?.email ? (
          <View style={styles.emailBlock}>
            <Text style={[styles.emailLabel, { color: theme.textSecondary }]}>이메일</Text>
            <Text style={[styles.emailValue, { color: theme.text }]}>{user.email}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* 하단 고정 저장 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <Pressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}>
          <Text style={styles.saveButtonText}>{isSaving ? '저장 중...' : '저장'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 20, // lg
  },

  avatarBlock: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emailBlock: {
    gap: 6,
  },
  emailLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  emailValue: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },

  // 하단 고정 저장 버튼
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveButton: {
    backgroundColor: Colors.navy,
    borderRadius: 8, // radius-button
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
});
