/**
 * Feature: monitoring (wifi, network, keep-awake related gates)
 */
export { startNetworkMonitoring } from '@/services/networkMonitor';
export { assertCampusWifiForJoin } from '@/services/campusWifiGate';
export { useWifiExamGate } from '@/hooks/useWifiExamGate';
export { useCampusWifiJoinGate } from '@/hooks/useCampusWifiJoinGate';
export { useAppState } from '@/hooks/useAppState';
