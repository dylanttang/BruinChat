# Media Viewer Gestures and Photo Zoom Plan

**Goal:** Pinch to zoom photos in the full-screen viewer, and make every viewer gesture (page, close, pan, tap, scrub) reliable on iOS, Android and web.

**Approach:** Move every viewer gesture to react-native-gesture-handler (RNGH) and every viewer animation to Reanimated, so gestures run on the native thread with explicit rules for which wins. Today the viewer uses React Native's JS responder system. That system is what caused the sideways-swipe-opens-reply and photo-won't-close bugs: Modal content is still a React child of the message, so the message's swipe-to-reply, double-tap-to-like and the gallery's swipe-down all compete for the viewer's touches.

**Status:** Done and tested on the iOS simulator, Rex's iPhone and web. PR next. Older unloaded messages are issue #97.

## Done when

- [x] Pinch zooms a photo around the fingers, 1x to 4x. Letting go below 1x snaps back to 1x (a short timing, no bounce). Past 4x it resists, then settles at 4x.
- [x] Zoomed: one finger pans, stopping at the photo's edges. No paging and no swipe-down close while zoomed.
- [x] Sideways swipes go through every photo and video in the chat, across messages.
- [x] Not zoomed: sideways pages between items, straight down closes (follows the finger down only), up and sideways-with-one-item do nothing.
- [x] Video: tap pauses or plays at once. No zoom on video. Play button and scrub bar work and never start a page swipe or close.
- [x] Tap outside the media closes. ✕ closes. Android back closes (not tested yet).
- [x] Nothing in the viewer reaches the chat behind it: no reply keyboard, no like, no list scroll, no gallery close.
- [x] Open and close still zoom from and back into the thumbnail, including closing while zoomed in.
- [x] Works on iOS simulator, Rex's iPhone and web. Android is not tested for now (Rex, 2026-11-06).
- [x] `npm test`, `npx tsc --noEmit` and `npm run test:security` pass.

## Dependencies

Install with `npx expo install` so versions match SDK 54 (`expo/bundledNativeModules.json`):

| Package | Version | Why |
|---|---|---|
| react-native-gesture-handler | ~2.28.0 | Native gestures with explicit composition |
| react-native-reanimated | ~4.1.1 | Animations and gesture callbacks on the UI thread |
| react-native-worklets | 0.5.1 | Required peer of Reanimated 4 (it allows 0.5 to 0.8) |

Checked:

- Reanimated 4.1 supports RN 0.78 to 0.82; we are on 0.81.5 with the new architecture on (`app.json` `newArchEnabled: true`). Reanimated 4 requires the new architecture.
- No Babel config is needed. babel-preset-expo 54 adds `react-native-worklets/plugin` automatically once the package is installed. Restart Metro with `--clear` once.
- Expo Go already includes all three. Dev clients and EAS builds need a rebuild, so the PR has to tell the team.

## Design

### 0. Swiping through the whole chat

The viewer pages through every photo and video in the chat (the loaded messages), oldest to newest, not just the tapped message's.

- `lib/messageMedia.ts`: `messageMedia(message)` (moved out of MessageBubble, so the chat and the bubble agree) and `chatMedia(messages)` builds the chat-wide list with a key per item (`messageId:index`).
- `chatMediaList.tsx`: a provider around the message list. Its value never changes, so a new message doesn't re-render every photo; the list is built when the viewer opens.
- ChatMedia registers each tile under its key. On open it measures every tile that's on screen, so the viewer grows from the tapped photo and shrinks back into whichever one it ends on (or fades if that one is off screen).
- The thread's first message (shown above the replies, outside the list) and the gallery grid keep paging within their own message.

### 1. Where gestures are allowed

- `app/_layout.tsx`: wrap the app in `GestureHandlerRootView style={{ flex: 1 }}`. RNGH requires this, and it changes nothing for existing screens because no RNGH gesture exists outside the viewer.
- Inside the viewer's `<Modal>`: a second `GestureHandlerRootView`. Android needs it because a Modal is a separate native window; on iOS it does no harm.
- Gallery stays on its current React Native Animated and PanResponder code. It isn't part of this change.

### 2. Keeping the chat from getting viewer touches

The JS responder system routes by React tree, not by what's on screen. Ancestors of the viewer that still compete:

| Ancestor | How it competes | Fix |
|---|---|---|
| SwipeToReply | Capture handler on sideways moves | Already skips while a viewer is open (`mediaOverlay.ts`) |
| MessageBubble TouchableOpacity | Double-tap-to-like on bubbling taps | Root sink (below) |
| MediaGallery (viewer opened from the gallery) | Capture handler on downward moves | Skip while a viewer is open (new) |
| FlatList ScrollView | JS responder while scrolling | Root sink |

- **Root sink:** the viewer's root View keeps `onStartShouldSetResponder={() => true}` and `onResponderTerminationRequest={() => false}`. Bubbling taps stop at the viewer, so they never reach the like handler. RNGH cancels this JS touch whenever a native gesture starts, which is fine because the sink does nothing.
- **Overlay flags:** `mediaOverlay.ts` tracks two counts: "any media overlay open" (gallery or viewer, used by SwipeToReply) and "viewer open" (used by the gallery's swipe-down capture). Today the gallery's capture can take a downward drag from a viewer opened on top of it, so this also fixes that.
- **Why not render the viewer at the app root (a portal) instead:** it would remove the ancestors entirely, but on iOS a Modal presents from its nearest view controller. A root-level viewer opened while the gallery Modal is showing would try to present from a controller that is already presenting, and fail. Keeping the viewer in place avoids that.

### 3. One rule for touchables

No React Native touchables (Pressable, TouchableOpacity, PanResponder) inside the viewer. When an RNGH gesture activates it cancels the JS touch, so a mix silently drops button presses: the bug we already hit. Every interactive element becomes an RNGH gesture with stated relations:

| Element | Gesture | Attached to | Relations |
|---|---|---|---|
| Page, close, zoomed pan | `Pan`, manual activation | Root | Simultaneous with pinch |
| Zoom | `Pinch` | Root | Simultaneous with pan. Enabled only on photo pages |
| Play/pause | `Tap` | Video page tap layer | None. Fires at once |
| Backdrop close | `Tap` | Backdrop view | None |
| ✕ | `Tap` with pressed feedback | ✕ button | None |
| Play button | `Tap` with pressed feedback | Play button | None |
| Scrub | `Pan`, `minDistance(0)` | Progress bar | `blocksExternalGesture(rootPan, rootPinch)` |

How region routing works: hit testing picks the topmost view under the finger. A gesture on that view or any of its ancestors sees the touch, and siblings underneath don't. So the backdrop tap never sees touches on the media, the video tap layer never sees touches on the controls (they're a sibling above it), and only the root pan and pinch see everything. Taps end on finger up and fail if the finger moves more than about 10px. The root pan activates only after an 8px move. So a tap and a drag can't both fire.

When zoomed in, the photo covers the screen, so tapping it doesn't close. Same as Photos and Instagram.

### 4. Root pan: one mode per touch

A shared value `mode` is one of `none`, `page`, `dismiss`, `zoom`. The pan uses `manualActivation(true)` and decides in `onTouchesMove`:

1. If `mode` is `zoom` or scale is above 1.01: activate as `zoom` (pan the photo).
2. Else, if two fingers are down: don't activate; pinch handles it.
3. Else, if the move is under 8px: wait.
4. Else, if mostly sideways and there are 2+ items: activate as `page`.
5. Else, if mostly downward: activate as `dismiss`.
6. Else (up, or sideways with one item): `fail()`. Nothing moves, and the touch isn't a tap either.

While active:

- `page`: row offset = `-index * pageWidth + resistDrag(...)`. On end, `swipeTarget(...)` picks the page; animate there; set `index` on JS.
- `dismiss`: `dragY = max(translationY, 0)`. On end, close if past 120px or flicked faster than 1 px/ms (RNGH velocity is px/s, so 1000); otherwise spring back.
- `zoom`: apply `changeX/changeY` to the zoom translation, rubber-banded past the edges. On end, decay with the release velocity, clamped to the edges (`withDecay` with `clamp`). Two-finger movement during a pinch also arrives here, because RNGH's pan follows the average of the fingers.

Pinch:

- `onStart`: if `mode` is `page` or `dismiss`, ignore the whole pinch. Else set `mode = zoom` and save the starting scale.
- `onUpdate`: new scale = rubber-banded `start * e.scale`. Translation shifts so the point under the fingers stays put (`zoomAround`).
- `onEnd`: clamp scale to 1 to 4 and translation to that scale's edges, animated with a short timing (a spring bounced). If the result is 1x, set `mode = none`.

### 5. Animations (Reanimated port)

Shared values on the viewer:

| Value | Replaces | Meaning |
|---|---|---|
| `progress` | Animated `progress` | 0 closed, 1 open |
| `rowX` | Animated `position` | Row of pages offset |
| `dragY` | Animated `pan.y` | Swipe-down distance (`pan.x` is gone) |
| `scale`, `zoomX`, `zoomY` | none | Current photo zoom |

`useAnimatedStyle` reproduces today's math exactly:

- Backdrop opacity is `progress * interpolate(dragY, [0, 400], [1, 0.35], clamp)`.
- Top bar opacity is `progress * interpolate(dragY, [0, 150], [1, 0], clamp)`.
- Current page transform is `translate(zoomFrom * (1 - progress) + zoom + (0, dragY))` and `scale(lerp(zoomFrom.scale, 1, progress) * interpolate(dragY, [0, 400], [1, 0.8]) * scale)`. Opacity follows progress as today.
- Neighbour pages: opacity is `progress`.
- Corner radius is `14 / scale`, so zoomed corners don't turn huge.

Zoom transforms the page view itself (the fitted rect with clipping). Scaling the view scales its clip too, so a zoomed photo fills past its original box.

Open, close and page settle use `withTiming` with the same durations and easing (`Easing.out(Easing.cubic)` and `Easing.inOut(Easing.cubic)`). Close animates `progress`, `dragY` and the zoom back to rest in parallel, then calls `onClose` through `scheduleOnRN` (exported by worklets 0.5.1).

React state only changes for `index` (which pages are mounted) and video playback UI. Nothing re-renders per frame during a gesture.

### 6. Reset rules

- Zoom resets to 1x (no animation) when `index` changes, the window size changes, or a page unmounts. You can't page while zoomed, so this only matters for safety.
- Close while zoomed animates the zoom out together with the shrink into the thumbnail.
- Video pages: pinch is disabled and scale stays 1.

### 7. Pure math in `lib/mediaLayout.ts`

New functions marked `'worklet'` so gestures can call them on the UI thread. They stay plain functions for the Node tests (the directive is just a string there).

| Function | Does |
|---|---|
| `panBounds(rect, scale, window)` | Max translation each way: `max(0, (rect.width * scale - window.width) / 2)`, and the same for height. `viewerRect` centres the rect, so the bounds are symmetric. |
| `rubberBand(value, min, max, dim)` | Lets a drag go past a limit with growing resistance. Also used for scale. |
| `zoomAround(t, s0, s1, focal, center)` | New translation keeping `focal` fixed: `t + (focal - center - t) * (1 - s1 / s0)`. |

The tests go in `tests/media-layout.test.cjs`: bounds are 0 at 1x and grow with scale; rubber band is identity inside the limits and lagging outside; `zoomAround` keeps the focal point fixed.

### 8. Platforms

- **iOS:** native recognizers. `cancelsTouchesInView` stays default (true). Under rule 3 there are no JS touchables left for it to cancel.
- **Android:** same gestures. Needs the Modal's `GestureHandlerRootView`. The video already uses `surfaceType="textureView"`, which follows transforms. Back button closes via `onRequestClose`.
- **Web:** RNGH and Reanimated both run on web. Mouse: drag pages and closes as on touch. No zoom on web, since there is no pinch with a mouse (trackpad pinch isn't handled by RNGH web). The old "browser click after a swipe" workaround (`swipedRef`) is removed, because RNGH taps fail once the pointer moves.

## Steps

- [x] 1. Branch `rex/viewer-gestures` off `rex/expo-video` (see Sequencing). `npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets`. Check that the lockfile only adds these and their dependencies.
- [x] 2. Add `GestureHandlerRootView` to `app/_layout.tsx`. Smoke test that the app, chat, swipe-to-reply and gallery are unchanged.
- [x] 3. Add the math functions and tests to `lib/mediaLayout.ts` and `tests/media-layout.test.cjs`. Run `npm test`.
- [x] 4. Split the `mediaOverlay.ts` flags. Make the gallery's swipe-down capture skip while a viewer is open.
- [x] 5. Port MediaViewer animations to Reanimated with the current gestures still in place. Check open, close, page and swipe-down look identical (screenshots before and after).
- [x] 6. Replace the viewer's PanResponder, Pressables and TouchableOpacitys with the RNGH gestures in section 3. Wrap the Modal content in `GestureHandlerRootView`. Keep the root sink.
- [x] 7. Add pinch and zoomed pan. Add the reset rules.
- [x] 8. Move ProgressBar to an RNGH pan that blocks the root pan and pinch.
- [x] 9. Test (below). Fix anything found.
- [x] 10. Remove leftovers: `swipedRef`, `wasSwipe`, the `PanResponder` import. Run `tsc`, `npm test` and `test:security`.
- [ ] 11. Open the PR: short and plain, notes the new native dependencies (rebuild dev clients), Android tested on what.

## Test plan

| Check | iOS sim | iPhone | Web | Android |
|---|---|---|---|---|
| Pinch in and out, past limits, release | agent-device pinch | yes | no (no mouse pinch) | yes |
| Zoomed pan stops at edges, flick decays | yes | yes | no | yes |
| Swipe pages, first and last resist | yes | yes | drag | yes |
| Swipe down closes; up does nothing | yes | yes | drag | yes |
| Video tap pauses at once; scrub; play button | yes | yes | yes | yes |
| Backdrop tap and ✕ close; Android back | yes | yes | yes | yes |
| No reply, like, scroll or gallery close from viewer touches | yes | yes | yes | yes |
| Viewer opened from gallery: close returns to gallery | yes | yes | yes | yes |
| Open and close animation, including closing while zoomed | yes | yes | yes | yes |
| Rotate while zoomed resets cleanly | yes | yes | resize window | yes |

Android isn't testable here (no Android SDK on this Mac). Options: a teammate with an Android phone, or installing Android Studio and an emulator (large download).

## Sequencing

One extra PR into `bobo/video-enhancement`, branch `rex/viewer-gestures` off `rex/expo-video`. It builds on #93's video code, so its description says to merge #93 first. Until then its diff also shows #93's changes. It carries the fixes found on the phone (smoother loop, music resumes after closing, swipe-to-reply and gallery no longer take viewer swipes), the gesture rewrite, pinch zoom, and swiping through the whole chat.

## Risks

- **New native dependencies.** Every dev client and EAS build needs a rebuild. Mitigation: call it out in the PR.
- **Reanimated and expo-video together.** The video sits inside a view animated by Reanimated instead of RN Animated. Both just set native transforms, so this should be the same. Step 5 checks it before any gesture work.
- **Modal plus GestureHandlerRootView on iOS 27.** It's the documented setup, but iOS 27 isn't covered by any RN 0.81 test. Step 6 checks it on the simulator and the phone.
- **Rule 3 slipping.** One leftover RN touchable inside the viewer brings back dropped taps. Step 10 greps for them.

## Effort

About a day of work plus testing: install and root wrap (short), animation port (about 2 hours), gestures and zoom (about 3 hours), testing and fixes (about 2 hours), plus Android time depending on the device.

## Decisions (Rex, 2026-11-06)

- No double-tap zoom.
- No video zoom.
- Android not tested for now.
- Ship as an extra PR rather than adding to #93.
