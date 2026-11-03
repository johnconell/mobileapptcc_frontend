import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

const encoder = new TextEncoder();
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export type PeerHandshakeResponse = {
  session_id: string;
  server_ephemeral_public_key: string;
  server_nonce: string;
  proof: string;
};

export type PeerCiphertext = {
  session_id: string;
  sequence: number;
  nonce: string;
  ciphertext: string;
};

export function assertPeerCiphertextContext(
  message: PeerCiphertext,
  expectedSessionId: string,
  expectedSequence: number,
): void {
  if (message.session_id !== expectedSessionId || message.sequence !== expectedSequence) {
    throw new Error('Secure peer response does not match the active request.');
  }
}

function decodeHex(value: string, expectedBytes?: number): Uint8Array {
  const valid = expectedBytes == null
    ? value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)
    : new RegExp(`^[0-9a-f]{${expectedBytes * 2}}$`, 'i').test(value);
  if (!valid) {
    throw new Error('Invalid peer cryptographic value.');
  }
  return hexToBytes(value);
}

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    out.set(value, offset);
    offset += value.length;
  }
  return out;
}

function handshakeTranscript(
  clientPublicKey: string,
  serverEphemeralPublicKey: string,
  clientNonce: string,
  serverNonce: string,
  sessionId: string,
): Uint8Array {
  return encoder.encode(
    `METCC-PEER-HANDSHAKE-v1|${clientPublicKey.toLowerCase()}|${serverEphemeralPublicKey.toLowerCase()}|${clientNonce.toLowerCase()}|${serverNonce.toLowerCase()}|${sessionId}`,
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function deriveKey(sharedSecret: Uint8Array, clientNonce: Uint8Array, serverNonce: Uint8Array, label: string): Uint8Array {
  return hkdf(
    sha256,
    sharedSecret,
    concatBytes(clientNonce, serverNonce),
    encoder.encode(label),
    KEY_BYTES,
  );
}

export function createPeerIdentity(privateKeyHex: string): {
  privateKey: string;
  publicKey: string;
} {
  const privateKey = decodeHex(privateKeyHex, KEY_BYTES);
  return {
    privateKey: privateKeyHex.toLowerCase(),
    publicKey: bytesToHex(x25519.getPublicKey(privateKey)),
  };
}

export function createPeerServerHandshake(input: {
  identityPrivateKey: string;
  clientPublicKey: string;
  clientNonce: string;
  serverEphemeralPrivateKey: string;
  serverNonce: string;
  sessionId: string;
}): { response: PeerHandshakeResponse; sessionKey: Uint8Array } {
  const identityPrivateKey = decodeHex(input.identityPrivateKey, KEY_BYTES);
  const clientPublicKeyBytes = decodeHex(input.clientPublicKey, KEY_BYTES);
  const clientNonce = decodeHex(input.clientNonce, 16);
  const serverEphemeralPrivateKey = decodeHex(input.serverEphemeralPrivateKey, KEY_BYTES);
  const serverNonce = decodeHex(input.serverNonce, 16);
  const serverEphemeralPublicKey = bytesToHex(x25519.getPublicKey(serverEphemeralPrivateKey));

  const proofKey = deriveKey(
    x25519.getSharedSecret(identityPrivateKey, clientPublicKeyBytes),
    clientNonce,
    serverNonce,
    `METCC peer identity proof v1:${input.sessionId}`,
  );
  const transcript = handshakeTranscript(
    input.clientPublicKey,
    serverEphemeralPublicKey,
    input.clientNonce,
    input.serverNonce,
    input.sessionId,
  );
  const proof = bytesToHex(hmac(sha256, proofKey, transcript));
  const sessionKey = deriveKey(
    x25519.getSharedSecret(serverEphemeralPrivateKey, clientPublicKeyBytes),
    clientNonce,
    serverNonce,
    `METCC peer session v1:${input.sessionId}`,
  );

  return {
    response: {
      session_id: input.sessionId,
      server_ephemeral_public_key: serverEphemeralPublicKey,
      server_nonce: input.serverNonce.toLowerCase(),
      proof,
    },
    sessionKey,
  };
}

export function completePeerClientHandshake(input: {
  identityPublicKey: string;
  clientPrivateKey: string;
  clientPublicKey: string;
  clientNonce: string;
  response: PeerHandshakeResponse;
}): Uint8Array {
  const identityPublicKey = decodeHex(input.identityPublicKey, KEY_BYTES);
  const clientPrivateKey = decodeHex(input.clientPrivateKey, KEY_BYTES);
  const clientPublicKey = decodeHex(input.clientPublicKey, KEY_BYTES);
  const clientNonce = decodeHex(input.clientNonce, 16);
  const serverNonce = decodeHex(input.response.server_nonce, 16);
  const serverEphemeralPublicKey = decodeHex(input.response.server_ephemeral_public_key, KEY_BYTES);

  const proofKey = deriveKey(
    x25519.getSharedSecret(clientPrivateKey, identityPublicKey),
    clientNonce,
    serverNonce,
    `METCC peer identity proof v1:${input.response.session_id}`,
  );
  const transcript = handshakeTranscript(
    input.clientPublicKey,
    input.response.server_ephemeral_public_key,
    input.clientNonce,
    input.response.server_nonce,
    input.response.session_id,
  );
  const expectedProof = hmac(sha256, proofKey, transcript);
  const receivedProof = decodeHex(input.response.proof, 32);
  if (!constantTimeEqual(expectedProof, receivedProof)) {
    throw new Error('Proctor identity verification failed. Scan the current proctor QR code.');
  }

  return deriveKey(
    x25519.getSharedSecret(clientPrivateKey, serverEphemeralPublicKey),
    clientNonce,
    serverNonce,
    `METCC peer session v1:${input.response.session_id}`,
  );
}

function associatedData(
  method: string,
  path: string,
  sessionId: string,
  sequence: number,
): Uint8Array {
  return encoder.encode(`${method.toUpperCase()}|${path}|${sessionId}|${sequence}`);
}

export function encryptPeerPayload(
  key: Uint8Array,
  sessionId: string,
  sequence: number,
  method: string,
  path: string,
  payload: unknown,
  nonceHex: string,
): PeerCiphertext {
  if (key.length !== KEY_BYTES || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Invalid peer message parameters.');
  }
  const nonce = decodeHex(nonceHex, NONCE_BYTES);
  const ciphertext = gcm(key, nonce, associatedData(method, path, sessionId, sequence))
    .encrypt(encoder.encode(JSON.stringify(payload)));
  return {
    session_id: sessionId,
    sequence,
    nonce: nonceHex.toLowerCase(),
    ciphertext: bytesToHex(ciphertext),
  };
}

export function decryptPeerPayload<T>(
  key: Uint8Array,
  message: PeerCiphertext,
  method: string,
  path: string,
): T {
  if (key.length !== KEY_BYTES || !Number.isSafeInteger(message.sequence) || message.sequence < 1) {
    throw new Error('Invalid peer message parameters.');
  }
  const plaintext = gcm(
    key,
    decodeHex(message.nonce, NONCE_BYTES),
    associatedData(method, path, message.session_id, message.sequence),
  ).decrypt(decodeHex(message.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
