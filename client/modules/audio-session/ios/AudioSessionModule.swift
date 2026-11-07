import AVFoundation
import ExpoModulesCore

public class AudioSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioSession")

    // expo-video never gives the phone's audio back, so music a video paused
    // stays paused. This gives it back and tells the music app it can resume.
    // It fails quietly if something is still playing.
    AsyncFunction("releaseAsync") {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
}
