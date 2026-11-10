import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/tds/components/Text';
import { Surface } from '@/tds/components/Surface';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';

type Props = {
  visible: boolean;
  hasTracks: boolean;
  refreshing: boolean;
  onClose: () => void;
  onMarkAllPlayed: () => void;
  onMarkAllUnplayed: () => void;
  onRefresh: () => void;
  onShare: () => void;
};

type ActionProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
};

function CollectionAction({ icon, label, onPress, disabled = false, busy = false }: ActionProps) {
  const palette = usePalette();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled, busy }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.action,
      { borderColor: palette.border, opacity: disabled ? 0.42 : pressed ? 0.68 : 1 },
    ]}
  >
    {busy ? <ActivityIndicator size="small" color={palette.text} /> : <Ionicons name={icon} size={20} color={palette.text} />}
    <AppText style={[styles.actionLabel, { color: palette.text }]}>{label}</AppText>
  </Pressable>;
}

export function QuranCollectionActionsSheet({
  visible,
  hasTracks,
  refreshing,
  onClose,
  onMarkAllPlayed,
  onMarkAllUnplayed,
  onRefresh,
  onShare,
}: Props) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLocalization();
  const direction = isRTL ? 'row-reverse' : 'row';

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.modalRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('close_button_label')} onPress={onClose} style={StyleSheet.absoluteFill} />
      <Surface style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.handleRow}><View style={[styles.handle, { backgroundColor: palette.border }]} /></View>
        <View style={[styles.header, { flexDirection: direction }]}>
          <AppText style={[styles.title, { color: palette.text }]}>{t('tafsiira_label')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={t('close_button_label')} onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={palette.text} />
          </Pressable>
        </View>
        <CollectionAction icon="checkmark-done-outline" label={t('mark_episodes_played_label')} disabled={!hasTracks} onPress={onMarkAllPlayed} />
        <CollectionAction icon="eye-off-outline" label={t('mark_episodes_not_played_label')} disabled={!hasTracks} onPress={onMarkAllUnplayed} />
        <CollectionAction icon="refresh-outline" label={t('refresh_feed_label')} disabled={refreshing} busy={refreshing} onPress={onRefresh} />
        <CollectionAction icon="share-outline" label={t('share_quran_collection_label')} onPress={onShare} />
      </Surface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8, gap: 8 },
  handleRow: { alignItems: 'center', paddingVertical: 3 },
  handle: { width: 38, height: 4, borderRadius: 3 },
  header: { minHeight: 42, alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontFamily: 'Inter-Bold', fontSize: 17 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 14 },
  actionLabel: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14 },
});
