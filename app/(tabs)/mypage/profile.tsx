// 마이페이지 > 프로필 편집 (하위 화면)
//
// 닉네임과 프로필 사진을 고친다.
// 닉네임은 "저장"을 눌러야 반영되지만, 사진은 고르는 즉시 올라간다 —
// 사진은 고른 순간 결과가 눈에 보여야 자연스럽고, 되돌리려면 다시 고르거나 지우면 되기 때문이다.
// 저장하면 public.users를 업데이트하고, AuthProvider의 프로필을 다시 불러와 앱 전체에 반영한다.

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { TextField } from '@/components/text-field';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { removeAvatar, updateNickname, uploadAvatar } from '@/data/profile';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 안내/실패 알림. 웹에서는 Alert.alert가 아무 일도 안 해서 window.alert로 대신한다.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function ProfileEditScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { user, profile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 사진을 고르면 즉시 올리고, 끝나면 프로필을 다시 불러와 화면에 반영한다.
  async function handlePickImage() {
    if (!user || isUploading) {
      return;
    }

    // 사진첩 접근 권한. 거부하면 고를 수 없으니 안내만 하고 끝낸다.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('사진 접근 권한이 필요해요', '설정에서 사진 접근을 허용한 뒤 다시 시도해주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1], // 아바타는 원형이라 정사각형으로 자르게 한다
      quality: 0.7, // 프로필 사진에 원본 화질까지는 필요 없다 (업로드 용량을 줄인다)
      base64: true, // Storage에 올리려면 바이트가 필요해서 base64로 받는다
    });

    if (result.canceled || !result.assets[0]?.base64) {
      return;
    }

    setIsUploading(true);
    try {
      const asset = result.assets[0];
      await uploadAvatar(user.id, asset.base64!, asset.mimeType ?? 'image/jpeg');
      await refreshProfile();
    } catch {
      notify('업로드 실패', '사진을 올리지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveImage() {
    if (!user || isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      await removeAvatar(user.id);
      await refreshProfile();
    } catch {
      notify('삭제 실패', '사진을 지우지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsUploading(false);
    }
  }

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
        {/* 아바타. 누르면 사진첩이 열리고, 고르는 즉시 올라간다.
            사진이 없으면 사람 아이콘으로 자리를 채운다(빈 원보다 무엇을 누르는 자리인지 분명하다) */}
        <View style={styles.avatarBlock}>
          <Pressable onPress={handlePickImage} disabled={isUploading}>
            <View style={[styles.avatar, { backgroundColor: theme.emptyCellBackground }]}>
              {profile?.profileImage ? (
                <Image source={{ uri: profile.profileImage }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-outline" size={36} color={theme.textSecondary} />
              )}
            </View>
            {/* 카메라 배지: 이 원이 누를 수 있는 자리라는 걸 알려준다 */}
            <View style={styles.avatarBadge}>
              <Ionicons name="camera-outline" size={16} color={Colors.textOnColor} />
            </View>
          </Pressable>

          <Text style={[styles.avatarHint, { color: theme.textSecondary }]}>
            {isUploading ? '올리는 중...' : '눌러서 사진 변경'}
          </Text>

          {profile?.profileImage && !isUploading ? (
            <Pressable onPress={handleRemoveImage} hitSlop={8}>
              <Text style={[styles.avatarRemove, { color: theme.textSecondary }]}>사진 삭제</Text>
            </Pressable>
          ) : null}
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
    gap: 8, // sm
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // 사진이 원 밖으로 삐져나오지 않게
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  avatarRemove: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textDecorationLine: 'underline',
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
