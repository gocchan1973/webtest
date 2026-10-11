import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { worker } from '../firebase-auth-poc/worker.mjs';

const page = new URL('../firebase-auth-poc/index.html', import.meta.url);
const configExample = new URL('../firebase-auth-poc/firebase-config.example.js', import.meta.url);

test('Firebase Auth PoC provides login, logout, and protected content states', async () => {
  const html = await readFile(page, 'utf8');

  assert.match(html, /id=["']login-panel["']/);
  assert.match(html, /id=["']app-panel["']/);
  assert.match(html, /id=["']logout-button["']/);
  assert.match(html, /id=["']google-login-button["']/);
  assert.match(html, /id=["']technews-button["']/);
  assert.match(html, /getIdToken/);
  assert.match(html, /auth\/session/);
  assert.match(html, /portal\/index\.html/);
  assert.match(html, /onAuthStateChanged/);
  assert.match(html, /signInWithEmailAndPassword/);
  assert.match(html, /GoogleAuthProvider/);
  assert.match(html, /signInWithPopup/);
  assert.match(html, /signOut/);
  assert.match(html, /認証は成功しましたが、このポータルの許可ユーザーではありません/);
});

test('Firebase Auth PoC keeps project settings in a local config module', async () => {
  const config = await readFile(configExample, 'utf8');

  assert.match(config, /export const firebaseConfig/);
  assert.match(config, /apiKey: 'YOUR_FIREBASE_WEB_API_KEY'/);
  assert.match(config, /projectId: 'YOUR_FIREBASE_PROJECT_ID'/);
});

test('Firebase Auth Worker rejects protected content without a session', async () => {
  const response = await worker.fetch(new Request('https://example.test/index.html'), {
    ASSETS: { fetch: async () => new Response('should not be served') },
  });

  assert.equal(response.status, 401);
});

test('Firebase Auth Worker sends an unauthenticated browser navigation to the login page', async () => {
  const response = await worker.fetch(new Request('https://example.test/', {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  }), {
    ASSETS: { fetch: async () => new Response('should not be served') },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/firebase-auth-poc/');
});

test('Firebase Auth Worker issues a session cookie after Firebase accepts the ID token', async () => {
  const response = await worker.fetch(new Request('https://example.test/auth/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
  }), {
    FIREBASE_API_KEY: 'test-api-key',
    FIREBASE_PROJECT_ID: 'ai510net',
    FIREBASE_ALLOWED_UIDS: 'user-1',
    fetchImpl: async () => new Response(JSON.stringify({ users: [{ localId: 'user-1' }] }), { status: 200 }),
    ASSETS: { fetch: async () => new Response('protected') },
  });

  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /tn_session=valid-token/);
});

test('Firebase Auth Worker rejects a verified user outside the UID allowlist', async () => {
  const response = await worker.fetch(new Request('https://example.test/auth/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
  }), {
    FIREBASE_API_KEY: 'test-api-key',
    FIREBASE_PROJECT_ID: 'ai510net',
    FIREBASE_ALLOWED_UIDS: 'allowed-user',
    fetchImpl: async () => new Response(JSON.stringify({ users: [{ localId: 'other-user' }] }), { status: 200 }),
    ASSETS: { fetch: async () => new Response('protected') },
  });

  assert.equal(response.status, 403);
});

test('Firebase Auth Worker serves protected content with a verified session', async () => {
  const response = await worker.fetch(new Request('https://example.test/index.html', {
    headers: { Cookie: 'tn_session=valid-token' },
  }), {
    FIREBASE_API_KEY: 'test-api-key',
    FIREBASE_PROJECT_ID: 'ai510net',
    FIREBASE_ALLOWED_UIDS: 'user-1',
    fetchImpl: async () => new Response(JSON.stringify({ users: [{ localId: 'user-1' }] }), { status: 200 }),
    ASSETS: { fetch: async () => new Response('protected') },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'protected');
});

test('Firebase Auth Worker configuration routes static assets through the auth gate', async () => {
  const wrangler = await readFile(new URL('../firebase-auth-poc/wrangler.toml', import.meta.url), 'utf8');
  const assetsIgnore = await readFile(new URL('../.assetsignore', import.meta.url), 'utf8');

  assert.match(wrangler, /run_worker_first\s*=\s*true/);
  assert.match(assetsIgnore, /\.wrangler\//);
  assert.doesNotMatch(assetsIgnore, /firebase-auth-poc\/firebase-config\.js/);
});
