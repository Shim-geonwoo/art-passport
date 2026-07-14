// 여권(Passport) 화면
//
// 관람 완료한 공연/전시가 스탬프(9칸, 3x3)로 쌓이는 화면이 들어갈 자리다.
// 지금은 화면 제목만 있는 빈 화면.

import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

export default function PassportScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>여권</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
});
