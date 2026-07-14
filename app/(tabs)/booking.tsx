// 예매(Booking) 화면
//
// 공연/전시를 찾아서 예매하는 화면이 들어갈 자리다.
// 지금은 화면 제목만 있는 빈 화면.

import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

export default function BookingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>예매</Text>
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
    fontFamily: Fonts.medium,
    fontSize: 22,
    color: Colors.textPrimary,
  },
});
