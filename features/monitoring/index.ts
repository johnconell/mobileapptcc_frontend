/**
 * Feature: monitoring (wifi, network, keep-awake related gates)
 */
export { startNetworkMonitoring } from '@/features/monitoring/services/networkMonitor';
export { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
export { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
export { useCampusWifiJoinGate } from '@/features/monitoring/hooks/useCampusWifiJoinGate';
export { useAppState } from '@/shared/hooks/useAppState';
