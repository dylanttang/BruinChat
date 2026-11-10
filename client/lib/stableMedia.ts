// Keeps a photo's link the same when the server sends the message again.
//
// The server signs every photo and video link, so the same photo can come
// back under a new link (after a reaction, an edit, or reopening the chat).
// A new link makes the app treat it as a new image: it forgets the photo's
// shape and loads it again, so it flashes into a grey square and back. When
// the photo is the same, we keep the link already on screen, as long as that
// link is good for a while longer. Our own just-sent photos keep their file
// on the phone, which is already loaded.
//
// No React Native imports, so it's unit-testable.

// A kept link must stay valid at least this long (seconds).
const MIN_REMAINING_S = 600;

type WithMedia = { mediaUrl?: string | null; mediaUrls?: string[] };

function isLocalFile(url: string) {
  return /^(file|ph|assets-library|content):/i.test(url);
}

function param(url: string, name: string) {
  const match = url.match(new RegExp(`[?&]${name}=([^&#]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// The same photo or video, whatever link it was signed with.
export function mediaIdentity(url: string) {
  const publicId = param(url, "public_id");
  if (!publicId) return url;
  return `${url.split("?")[0]}|${publicId}|${param(url, "format") ?? ""}`;
}

function keepUrl(previous: string | null | undefined, next: string, nowS: number) {
  if (!previous || previous === next) return next;
  if (isLocalFile(previous)) return previous;
  if (mediaIdentity(previous) !== mediaIdentity(next)) return next;
  const expiresAt = Number(param(previous, "expires_at"));
  return !expiresAt || expiresAt - nowS > MIN_REMAINING_S ? previous : next;
}

// `incoming` with its links swapped for the ones in `previous` wherever they
// show the same photo. Anything else about `incoming` is left alone.
export function keepLoadedMedia<T extends WithMedia>(previous: WithMedia | null | undefined, incoming: T, nowS = Date.now() / 1000): T {
  if (!previous) return incoming;
  let changed = false;
  const result = { ...incoming };
  const prevUrls = previous.mediaUrls ?? [];
  const nextUrls = incoming.mediaUrls ?? [];
  if (nextUrls.length && prevUrls.length === nextUrls.length) {
    const kept = nextUrls.map((url, index) => keepUrl(prevUrls[index], url, nowS));
    if (kept.some((url, index) => url !== nextUrls[index])) {
      result.mediaUrls = kept;
      changed = true;
    }
  }
  if (incoming.mediaUrl && previous.mediaUrl) {
    const kept = keepUrl(previous.mediaUrl, incoming.mediaUrl, nowS);
    if (kept !== incoming.mediaUrl) {
      result.mediaUrl = kept;
      changed = true;
    }
  }
  return changed ? result : incoming;
}
