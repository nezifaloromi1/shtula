import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { ActionButton } from '@/shared/components/ActionButton';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';

export function StartupErrorScreen({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <View style={[styles.content, { direction: isRTL ? 'rtl' : 'ltr' }]}>
        <AppText accessibilityRole="header" style={[textStyles.heading, styles.title]}>
          {t('storage_unavailable_title')}
        </AppText>
        <AppText style={[textStyles.body, { color: palette.muted }]}>
          {t('storage_unavailable_message', { message })}
        </AppText>
        <ActionButton
          title={t('startup_retry')}
          onPress={onRetry}
          disabled={retrying}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 18 },
  title: { textAlign: 'center' },
  button: { marginTop: 8 },
});
