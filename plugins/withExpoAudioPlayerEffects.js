const fs = require('node:fs');
const path = require('node:path');

const AUDIO_SESSION_PROPERTY = `      Property("audioSessionId") { player ->
        runOnMain { player.ref.audioSessionId }
      }
`;

const SKIP_SILENCE_PROPERTY = `      Property("skipSilenceEnabled") { player ->
        runOnMain { player.ref.skipSilenceEnabled }
      }.set { player, enabled: Boolean ->
        runOnMain { player.ref.skipSilenceEnabled = enabled }
      }
`;
const ANCHOR = `      Property("id") { player ->
        player.id
      }
`;

function patchAudioModule(source) {
  if (!source.includes(ANCHOR)) {
    throw new Error('Unsupported expo-audio Android source: AudioPlayer id property anchor was not found.');
  }

  let patched = source;
  if (!patched.includes('Property("audioSessionId")')) {
    patched = patched.replace(ANCHOR, `${ANCHOR}\n${AUDIO_SESSION_PROPERTY}`);
  }
  if (!patched.includes('Property("skipSilenceEnabled")')) {
    const audioSessionAnchor = AUDIO_SESSION_PROPERTY.trimEnd();
    if (!patched.includes(audioSessionAnchor)) {
      throw new Error('Unable to locate the injected audioSessionId property before adding skip-silence support.');
    }
    patched = patched.replace(audioSessionAnchor, `${audioSessionAnchor}\n${SKIP_SILENCE_PROPERTY.trimEnd()}`);
  }
  return patched;
}

function withExpoAudioPlayerEffects(config) {
  const { withDangerousMod } = require('@expo/config-plugins');
  return withDangerousMod(config, ['android', async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const packageRoot = path.join(projectRoot, 'node_modules', 'expo-audio');
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const sourcePath = path.join(packageRoot, 'android/src/main/java/expo/modules/audio/AudioModule.kt');

    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(sourcePath)) {
      throw new Error('Sheademtula Android audio effects require the Expo SDK 58 expo-audio Android source.');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (!String(packageJson.version || '').startsWith('58.')) {
      throw new Error(`Sheademtula audio-session patch supports expo-audio 58.x; found ${packageJson.version || 'unknown'}.`);
    }

    const source = fs.readFileSync(sourcePath, 'utf8');
    const patched = patchAudioModule(source);
    if (patched !== source) fs.writeFileSync(sourcePath, patched, 'utf8');
    return modConfig;
  }]);
}

module.exports = withExpoAudioPlayerEffects;
module.exports.patchAudioModule = patchAudioModule;
module.exports.AUDIO_SESSION_PROPERTY = AUDIO_SESSION_PROPERTY;
module.exports.SKIP_SILENCE_PROPERTY = SKIP_SILENCE_PROPERTY;
