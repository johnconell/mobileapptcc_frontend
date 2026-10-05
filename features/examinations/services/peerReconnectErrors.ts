export function classifyPeerReconnectError(raw: string): string {
  const text = (raw || '').toLowerCase();

  if (text.includes('removed') || text.includes('terminated')) {
    return 'Removed by proctor';
  }
  if (text.includes('expired') && (text.includes('pin') || text.includes('code'))) {
    return 'Reconnect PIN expired';
  }
  if (
    (text.includes('invalid') || text.includes('required')) &&
    (text.includes('pin') || text.includes('reconnect code'))
  ) {
    return 'Reconnect PIN required';
  }
  if (
    text.includes('session not found') ||
    text.includes('no longer joined') ||
    text.includes('no examination is open') ||
    text.includes('examination has already ended') ||
    text.includes('session has ended')
  ) {
    return 'Session ended';
  }
  if (
    text.includes('cannot reach') ||
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('timeout') ||
    text.includes('timed out')
  ) {
    return 'Cannot reach the proctor';
  }
  return raw || 'Cannot reach the proctor';
}
