import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeAudioEffects = {
  setVolumeBoostEnabled(audioSessionId: number, enabled: boolean): Promise<boolean>;
};

const nativeEffects = requireOptionalNativeModule<NativeAudioEffects>('SheademtulaAudioEffects');

/** Returns false when the platform or current audio session cannot provide the effect. */
export function setVolumeBoostEnabled(audioSessionId: number, enabled: boolean): Promise<boolean> {
  if (!nativeEffects) return Promise.resolve(false);
  return nativeEffects.setVolumeBoostEnabled(audioSessionId, enabled);
}
