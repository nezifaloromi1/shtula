import React from 'react';
import { Image, Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppText } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';
import artwork from '../../../assets/images/sheademtula-artwork.png';

export function TopBar({ title = 'Sheademtula', showBrand = false }: { title?: string; showBrand?: boolean }) {
  const navigation = useNavigation<any>();
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  return <View style={[styles.row, { direction: isRTL ? 'rtl' : 'ltr' }]}>
    <View style={styles.titleRow}>
      {showBrand ? <Image source={artwork} style={styles.logo} /> : null}
      <AppText style={[styles.title, { color: palette.text }]}>{title}</AppText>
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityLabel={t('search_button_label')} onPress={() => navigation.navigate('Search')} style={styles.icon}><Ionicons name="search" size={22} color={palette.text} /></Pressable>
      <Pressable accessibilityLabel={t('settings_label')} onPress={() => navigation.navigate('Settings')} style={styles.icon}><Ionicons name="menu" size={22} color={palette.text} /></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { fontSize: 22, fontFamily: 'Inter-Bold', letterSpacing: -0.5 }, logo: { width: 34, height: 34, borderRadius: 9 }, actions: { flexDirection: 'row', gap: 6 }, icon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' } });
