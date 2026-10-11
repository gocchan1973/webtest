const SESSION_COOKIE = 'tn_session';
const PUBLIC_PATHS = new Set(['/firebase-auth-poc/', '/firebase-auth-poc/index.html', '/firebase-auth-poc/firebase-config.js']);

function bearerToken(request) {
  const value = request.headers.get('Authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function cookieValue(request, name) {
  const cookies = request.headers.get('Cookie') ?? '';
  const entry = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

export async function verifyFirebaseIdToken(token, env) {
  if (!token || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_ALLOWED_UIDS) return { status: 'unauthorized' };
  const request = new Request(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  const fetcher = env.fetchImpl ?? fetch;
  const response = await fetcher(request);
  if (!response.ok) return { status: 'unauthorized' };
  const body = await response.json();
  const user = Array.isArray(body.users) ? body.users[0] : null;
  if (!user?.localId) return { status: 'unauthorized' };
  const allowedUids = new Set(env.FIREBASE_ALLOWED_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean));
  return allowedUids.has(user.localId) ? { status: 'allowed' } : { status: 'forbidden' };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' },
  });
}

function forbidden() {
  return new Response('Firebase authentication succeeded, but this portal does not allow this user.', {
    status: 403,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function rejectAuth(result) {
  return result.status === 'forbidden' ? forbidden() : unauthorized();
}

function loginRedirect(request, url) {
  const acceptsHtml = (request.headers.get('Accept') ?? '').includes('text/html');
  if (url.pathname === '/' && acceptsHtml) {
    return new Response(null, { status: 302, headers: { Location: '/firebase-auth-poc/', 'Cache-Control': 'no-store' } });
  }
  return null;
}

export const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth/session') {
      if (request.method === 'DELETE') {
        return new Response(null, {
          status: 204,
          headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
        });
      }
      if (request.method !== 'POST') return jsonResponse(405, { error: 'method-not-allowed' });
      const token = bearerToken(request);
      const result = await verifyFirebaseIdToken(token, env);
      if (result.status !== 'allowed') return rejectAuth(result);
      return new Response(null, {
        status: 204,
        headers: { 'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600` },
      });
    }

    if (PUBLIC_PATHS.has(url.pathname)) return env.ASSETS.fetch(request);

    const token = bearerToken(request) || decodeURIComponent(cookieValue(request, SESSION_COOKIE));
    const result = await verifyFirebaseIdToken(token, env);
    if (result.status !== 'allowed') return loginRedirect(request, url) ?? rejectAuth(result);
    return env.ASSETS.fetch(request);
  },
};

export default worker;
