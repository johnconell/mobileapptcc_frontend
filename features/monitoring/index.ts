export { startNetworkMonitoring } from '@/features/monitoring/services/networkMonitor';
export { startProctorHostIpSync, stopProctorHostIpSync } from '@/features/monitoring/services/proctorHostIpSync';
export { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
export { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
export type { WifiDisconnectReason } from '@/features/monitoring/hooks/useWifiExamGate';
export { useCampusWifiJoinGate } from '@/features/monitoring/hooks/useCampusWifiJoinGate';
export { useAppState } from '@/shared/hooks/useAppState';
