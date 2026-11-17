export type PeerListenerRecoveryState = 'live' | 'reconnecting' | 'unavailable' | 'stopped';

export type PeerListenerRecoveryAction = 'none' | 'mark_unavailable' | 'rebind';

/**
 * Decide how the native LAN listener should follow an active examination
 * across the temporary no-address window produced by Wi-Fi/DHCP switching.
 * Examination session data must never be recreated during network recovery.
 */
export function peerListenerRecoveryAction(input: {
  hasActiveSession: boolean;
  previousHost: string | null;
  nextHost: string | null;
  listenerState: PeerListenerRecoveryState;
  /**
   * Optional identity for the active LAN interface. Two Wi-Fi networks can
   * hand out the same address range (and, in rare cases, the same address),
   * so an IP comparison alone is not enough to know that the native listener
   * must be rebound.
   */
  previousNetworkKey?: string | null;
  nextNetworkKey?: string | null;
}): PeerListenerRecoveryAction {
  if (!input.hasActiveSession) return 'none';
  if (!input.nextHost) {
    return input.previousHost || input.listenerState !== 'unavailable'
      ? 'mark_unavailable'
      : 'none';
  }
  const networkChanged =
    input.previousNetworkKey !== input.nextNetworkKey &&
    (input.previousNetworkKey != null || input.nextNetworkKey != null);
  if (input.nextHost !== input.previousHost || networkChanged || input.listenerState !== 'live') {
    return 'rebind';
  }
  return 'none';
}
