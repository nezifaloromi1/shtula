import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { patchAudioModule } = require('../plugins/withExpoAudioPlayerEffects.js');
const fixture = `      Property("id") { player ->
        player.id
      }

      Property("isBuffering") { player ->
        runOnMain { player.ref.playbackState == Player.STATE_BUFFERING }
      }
`;

test('patch exposes the Media3 audio session and skip-silence switch', () => {
  const patched = patchAudioModule(fixture);
  assert.match(patched, /Property\("audioSessionId"\)/);
  assert.match(patched, /Property\("skipSilenceEnabled"\)/);
  assert.match(patched, /player\.ref\.skipSilenceEnabled = enabled/);
  assert.ok(patched.indexOf('Property("audioSessionId")') < patched.indexOf('Property("skipSilenceEnabled")'));
});

test('patch is idempotent', () => {
  const once = patchAudioModule(fixture);
  assert.equal(patchAudioModule(once), once);
});

test('patch fails closed when the pinned Expo Audio source shape changes', () => {
  assert.throws(() => patchAudioModule('class AudioModule {}'), /id property anchor/);
});
