import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { usePalette } from '@/tds/theme';
import { colors, radius, typography } from '@/tds/tokens';

export function ActionButton({ title, onPress, secondary = false, disabled = false, style }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? palette.raised : colors.accent, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }, style]}>
    <Text style={[styles.label, { color: secondary ? palette.text : '#FFFFFF' }]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }, label: { fontFamily: typography.medium, fontSize: 14 } });
