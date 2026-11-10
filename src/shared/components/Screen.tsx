import React from 'react';
import { ScrollView, View, ViewStyle, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';

export function Screen({ children, contentStyle, scroll = true }: React.PropsWithChildren<{ contentStyle?: ViewStyle; scroll?: boolean }>) {
  const palette = usePalette();
  const { isRTL } = useLocalization();
  const direction = isRTL ? 'rtl' : 'ltr';
  const content = scroll
    ? <ScrollView contentContainerStyle={[styles.content, { direction }, contentStyle]} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    : <View style={[styles.content, { direction }, contentStyle]}>{children}</View>;
  return <SafeAreaView edges={['top']} style={{ flex: 1, direction, backgroundColor: palette.background }}>{content}</SafeAreaView>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 18 } });
