/**
 * The access token is held in memory only — it is never written to
 * localStorage, so a script injected into the page cannot read it back.
 * Sessions survive a reload through the httpOnly refresh cookie instead.
 */
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const clearAccessToken = () => {
  accessToken = null;
};

// "Remember me" only stores the identifier, so the field is pre-filled next
// visit. No credential is persisted.
const REMEMBERED_KEY = 'aerp.rememberedIdentifier';

export function getRememberedIdentifier() {
  try {
    return window.localStorage.getItem(REMEMBERED_KEY) || '';
  } catch {
    return '';
  }
}

export function setRememberedIdentifier(identifier) {
  try {
    if (identifier) window.localStorage.setItem(REMEMBERED_KEY, identifier);
    else window.localStorage.removeItem(REMEMBERED_KEY);
  } catch {
    /* storage unavailable (private mode) — remembering is optional */
  }
}
