/**
 * Wi‑Fi LAN IP helpers — prefer the private Wi‑Fi address, never a cellular/
 * public/CGNAT IP. Shared so peer hosting and room-open checks stay consistent
 * without circular imports between PeerExamServer and proctorWifiLock.
 */
import * as Network from 'expo-network';

/** RFC1918 private ranges (typical campus / hotspot Wi‑Fi). */
export function isPrivateLanIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function sanitizeCandidate(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = String(ip).trim();
  if (
    !trimmed ||
    trimmed === '0.0.0.0' ||
    trimmed.startsWith('127.') ||
    trimmed.startsWith('169.254.')
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Resolve the Wi‑Fi LAN IP suitable for hosting a peer exam server.
 * Returns null when Wi‑Fi is not active or the only IP looks like cellular/WAN.
 */
export async function resolveWifiLanIp(): Promise<{
  ip: string | null;
  isWifi: boolean;
  type: Network.NetworkStateType | null;
  /** True when the OS primary route is cellular (or IP is not private LAN). */
  cellularLikely: boolean;
  isInternetReachable: boolean | null;
}> {
  try {
    const net = await Network.getNetworkStateAsync();
    const type = net.type ?? null;
    const isWifi = type === Network.NetworkStateType.WIFI;
    const isCellular = type === Network.NetworkStateType.CELLULAR;

    // Prefer explicit Wi‑Fi detail IP when expo-network exposes it.
    const detailIp = sanitizeCandidate(
      (net as { details?: { ipAddress?: string | null } }).details?.ipAddress,
    );
    const genericIp = sanitizeCandidate(
      await Network.getIpAddressAsync().catch(() => null),
    );

    const preferred =
      (detailIp && isPrivateLanIp(detailIp) ? detailIp : null) ||
      (genericIp && isPrivateLanIp(genericIp) ? genericIp : null) ||
      null;

    const cellularLikely =
      isCellular ||
      (isWifi && !preferred && Boolean(genericIp || detailIp)) ||
      (isWifi && Boolean(genericIp) && !isPrivateLanIp(genericIp));

    return {
      ip: isWifi ? preferred : null,
      isWifi,
      type,
      cellularLikely,
      isInternetReachable: net.isInternetReachable ?? null,
    };
  } catch {
    return {
      ip: null,
      isWifi: false,
      type: null,
      cellularLikely: false,
      isInternetReachable: null,
    };
  }
}

/** True when the device reports real internet reachability (not just LAN). */
export async function assertCloudInternetReachable(): Promise<void> {
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected === false) {
      throw new Error(
        'No network connection. Connect to Wi‑Fi or mobile data with internet access, then sync again.',
      );
    }
    // isInternetReachable === false means LAN-only (campus Wi‑Fi without WAN).
    // null/undefined = unknown — allow the request and let HTTP fail clearly.
    if (net.isInternetReachable === false) {
      throw new Error(
        'This network has no internet access (LAN only). Connect to a network that can reach the Admin API, then sync again.',
      );
    }
  } catch (err) {
    if (err instanceof Error && /No network|no internet/i.test(err.message)) {
      throw err;
    }
    // If Network API itself fails, proceed — cloudFetch will surface the error.
  }
}
