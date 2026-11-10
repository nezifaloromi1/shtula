import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { radius } from '../tokens';
import { usePalette } from '../theme';

export function Surface({ style, ...props }: ViewProps) {
  const palette = usePalette();
  return <View {...props} style={[styles.surface, { backgroundColor: palette.surface, borderColor: palette.border }, style]} />;
}
const styles = StyleSheet.create({ surface: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: 'hidden' } });
