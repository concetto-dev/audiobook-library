// Identity seam. Plain listening never calls this; only the annotation layer
// does. Today everyone is an anonymous local user (no login, listen for free).
// When accounts arrive, currentUser() returns the signed-in identity and
// isAnonymous() flips — capture/sync code already keys on user.id, so nothing
// downstream changes.

const LOCAL_ID_KEY = "ab:localUserId";

function ensureLocalId() {
  try {
    let id = localStorage.getItem(LOCAL_ID_KEY);
    if (!id) {
      id = "local-" + (crypto.randomUUID?.() || Date.now().toString(36));
      localStorage.setItem(LOCAL_ID_KEY, id);
    }
    return id;
  } catch (_) {
    return "local-anon";
  }
}

export function currentUser() {
  return { id: ensureLocalId(), anonymous: true, name: "You" };
}

export function isAnonymous() {
  return currentUser().anonymous;
}

// Placeholder for the future accounts model (free listen / sign-up to annotate).
export function canAnnotate() {
  return true; // local-anonymous can annotate; gating moves here with accounts.
}
