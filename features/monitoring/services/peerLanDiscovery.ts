import type { PeerQrTarget } from '@/features/examinations/services/peerExamServer';

/**
 * LAN discovery is intentionally disabled: an untrusted host found by scanning
 * the subnet cannot provide an authenticated proctor identity. Peer mode must
 * start from the proctor QR, which pins that identity.
 */
export async function discoverPeerExamHostByCode(
  rawCode: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PeerQrTarget | null> {
  const code = rawCode.trim().toUpperCase();
  if (code) {
    const { PeerExamClient } = await import('@/features/examinations/services/peerExamClient');
    const target = await PeerExamClient.getTarget();
    if (
      target?.code.trim().toUpperCase() === code &&
      /^[0-9a-f]{64}$/i.test(target.peerPublicKey)
    ) {
      onProgress?.(1, 1);
      return target;
    }
  }

  onProgress?.(0, 0);
  return null;
}
