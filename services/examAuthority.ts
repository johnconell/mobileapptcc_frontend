export type AuthorityStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'ENDED';

const RANK: Record<AuthorityStatus, number> = {
  WAITING: 0,
  STARTING: 1,
  ACTIVE: 2,
  PAUSED: 2,
  ENDED: 3,
};

export function canReplace(current: AuthorityStatus, incoming: AuthorityStatus): boolean {
  if (incoming === current) return true;
  if (incoming === 'ENDED') return true;
  if (current === 'ENDED' && incoming !== 'ENDED') return false;
  if (incoming === 'WAITING' && current !== 'WAITING') return false;
  if (incoming === 'STARTING' && (current === 'ACTIVE' || current === 'PAUSED')) return false;
  return RANK[incoming] >= RANK[current];
}

export function mapServerToAuthority(roomStatus?: string | null): AuthorityStatus {
  const status = String(roomStatus || '').trim().toLowerCase();
  if (status === 'ended') return 'ENDED';
  if (status === 'in_progress' || status === 'active') return 'ACTIVE';
  if (status === 'paused') return 'PAUSED';
  if (status === 'starting') return 'STARTING';
  if (status === 'waiting' || status === 'lobby_open') return 'WAITING';
  return 'WAITING';
}
