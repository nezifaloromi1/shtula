import React from 'react';
import { Text as NativeText, TextProps, StyleSheet } from 'react-native';
import { typography } from '../tokens';
import { usePalette } from '../theme';
import { useLocalization } from '@/localization/LocalizationProvider';

export function AppText({ style, ...props }: TextProps) {
  const palette = usePalette();
  const { locale, isRTL } = useLocalization();
  const usesNativeScriptFont = locale === 'am' || locale === 'ar';
  return <NativeText {...props} style={[
    styles.text,
    { color: palette.text, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
    style,
    usesNativeScriptFont ? styles.nativeScriptText : null,
  ]} />;
}
export const textStyles = StyleSheet.create({ heading: { fontFamily: typography.bold, fontSize: 25, letterSpacing: -0.6 }, subheading: { fontFamily: typography.medium, fontSize: 17 }, body: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21 }, muted: { fontFamily: typography.regular, fontSize: 13, color: '#929BA7' }, label: { fontFamily: typography.medium, fontSize: 12, letterSpacing: 0.3 } });
const styles = StyleSheet.create({
  text: { fontFamily: typography.regular },
  // Inter does not cover Ethiopic or Arabic. Let Android/iOS select their native script fonts.
  nativeScriptText: { fontFamily: undefined, letterSpacing: 0 },
});
