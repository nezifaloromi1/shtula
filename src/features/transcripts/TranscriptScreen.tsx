import React from 'react';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { useLocalization } from '@/localization/LocalizationProvider';
import { TranscriptPanel } from './TranscriptPanel';

export default function TranscriptScreen() {
  const { t } = useLocalization();
  return <Screen scroll={false} contentStyle={{ flex: 1, gap: 10 }}>
    <TopBar title={t('transcript_label')} />
    <TranscriptPanel />
  </Screen>;
}
