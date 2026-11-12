// Session helpers. The server issues 2-hour JWTs; the browser keeps the token
// and the public user record in localStorage.

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function readPayload(token) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

// A token we cannot read, or one without a future `exp`, is treated as expired.
export function isTokenExpired(token, now = Date.now()) {
  const payload = readPayload(token);
  return !payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= now;
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

// Returns the saved token, or null when there is none or it has expired
// (an expired session is cleared so the user is not stuck on stale state).
export function getToken() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!token) return null;
  if (isTokenExpired(token)) {
    clearSession();
    return null;
  }
  return token;
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}
