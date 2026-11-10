import React, { useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import coverArtwork from '../../../../assets/images/cover.jpg';

export function QuranArtwork({ uri, style }: { uri?: string | null; style?: StyleProp<ImageStyle> }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const source = uri && failedUri !== uri ? { uri } : coverArtwork;
  return <Image source={source} style={style} resizeMode="cover" onError={() => { if (uri) setFailedUri(uri); }} />;
}
