import { requireOptionalNativeModule } from "expo";

// iOS only. Elsewhere this does nothing.
const AudioSession = requireOptionalNativeModule<{ releaseAsync(): Promise<void> }>("AudioSession");

// Lets music a video paused start again. Call it once no video is playing.
export function releaseAudio() {
  AudioSession?.releaseAsync().catch(() => {});
}
