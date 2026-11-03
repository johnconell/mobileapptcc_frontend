import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPeerCiphertextContext,
  completePeerClientHandshake,
  createPeerIdentity,
  createPeerServerHandshake,
  decryptPeerPayload,
  encryptPeerPayload,
} from './peerTransportCrypto';

const clientPrivateKey = '11'.repeat(32);
const serverIdentityPrivateKey = '22'.repeat(32);
const serverEphemeralPrivateKey = '33'.repeat(32);
const clientNonce = '44'.repeat(16);
const serverNonce = '55'.repeat(16);

function handshake() {
  const client = createPeerIdentity(clientPrivateKey);
  const identity = createPeerIdentity(serverIdentityPrivateKey);
  const server = createPeerServerHandshake({
    identityPrivateKey: serverIdentityPrivateKey,
    clientPublicKey: client.publicKey,
    clientNonce,
    serverEphemeralPrivateKey,
    serverNonce,
    sessionId: 'session-test-1',
  });
  return { client, identity, server };
}

test('authenticated handshake derives the same key and rejects a different proctor identity', () => {
  const { client, identity, server } = handshake();
  const clientKey = completePeerClientHandshake({
    identityPublicKey: identity.publicKey,
    clientPrivateKey,
    clientPublicKey: client.publicKey,
    clientNonce,
    response: server.response,
  });

  assert.deepEqual(clientKey, server.sessionKey);
  assert.throws(
    () =>
      completePeerClientHandshake({
        identityPublicKey: createPeerIdentity('66'.repeat(32)).publicKey,
        clientPrivateKey,
        clientPublicKey: client.publicKey,
        clientNonce,
        response: server.response,
      }),
    /identity verification failed/i,
  );
});

test('peer payload encryption authenticates path, method, and sequence', () => {
  const { server } = handshake();
  const payload = { answers: [{ questionId: '1', selectedAnswer: 'A' }] };
  const encrypted = encryptPeerPayload(
    server.sessionKey,
    'session-test-1',
    1,
    'POST',
    '/p2p/answers',
    payload,
    '77'.repeat(12),
  );

  assert.deepEqual(
    decryptPeerPayload(server.sessionKey, encrypted, 'POST', '/p2p/answers'),
    payload,
  );
  assertPeerCiphertextContext(encrypted, 'session-test-1', 1);
  assert.throws(() => assertPeerCiphertextContext(encrypted, 'other-session', 1));
  assert.throws(() => assertPeerCiphertextContext(encrypted, 'session-test-1', 2));
  assert.throws(() =>
    decryptPeerPayload(server.sessionKey, encrypted, 'POST', '/p2p/submit'),
  );
  assert.throws(() =>
    decryptPeerPayload(
      server.sessionKey,
      { ...encrypted, sequence: 2 },
      'POST',
      '/p2p/answers',
    ),
  );
});

test('tampered peer ciphertext is rejected', () => {
  const { server } = handshake();
  const encrypted = encryptPeerPayload(
    server.sessionKey,
    'session-test-1',
    1,
    'POST',
    '/p2p/submit',
    { attempt: true },
    '88'.repeat(12),
  );
  const firstByte = Number.parseInt(encrypted.ciphertext.slice(0, 2), 16) ^ 1;
  const tampered = `${firstByte.toString(16).padStart(2, '0')}${encrypted.ciphertext.slice(2)}`;

  assert.throws(() =>
    decryptPeerPayload(
      server.sessionKey,
      { ...encrypted, ciphertext: tampered },
      'POST',
      '/p2p/submit',
    ),
  );
});
