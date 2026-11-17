import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { ShieldCheck, RefreshCw } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

export const Step5_LobbyScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.stepperText}>Step 3 of 6 · Examination Lobby</Text>
        <Text style={styles.screenTitle}>Waiting for Proctor</Text>
      </View>

      {/* Pending Status Alert Banner */}
      <View style={styles.statusBanner}>
        <View style={styles.pulseDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>PENDING PROCTOR ADMISSION</Text>
          <Text style={styles.statusSub}>
            Your joining request is submitted. Awaiting approval from Room 102 proctor.
          </Text>
        </View>
        <ActivityIndicator size="small" color="#EA580C" />
      </View>

      {/* Examinee Profile Badge */}
      <View style={styles.card}>
        <View style={styles.examineeRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>JD</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.examineeName}>Juan Dela Cruz</Text>
            <Text style={styles.examineeId}>App #: TCC-2026-08492 · Seat 14</Text>
          </View>
          <View style={styles.seatBadge}>
            <Text style={styles.seatBadgeText}>LAB 1</Text>
          </View>
        </View>

        <View style={styles.downloadBar}>
          <View style={styles.downloadHeader}>
            <Text style={styles.downloadLabel}>Exam Pack Verification:</Text>
            <Text style={styles.downloadPercent}>100% Ready</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
        </View>
      </View>

      {/* Rules & Regulations Preview */}
      <View style={styles.rulesCard}>
        <View style={styles.rulesHeader}>
          <ShieldCheck size={14} color="#7A1F2B" />
          <Text style={styles.rulesTitle}>Rules & Guidelines</Text>
        </View>
        <Text style={styles.ruleItem}>• <Text style={styles.ruleBold}>Screen Pinning:</Text> Tap GOT IT when prompt appears.</Text>
        <Text style={styles.ruleItem}>• <Text style={styles.ruleBold}>No Devices:</Text> Secondary phones are prohibited.</Text>
        <Text style={styles.ruleItem}>• <Text style={styles.ruleBold}>Duration:</Text> 60 Minutes. Auto-submits on 00:00.</Text>
        <Text style={styles.ruleItem}>• <Text style={styles.ruleBold}>Passing Standard:</Text> 75.0% score required.</Text>
      </View>

      {/* Live Local Link Network Health Box */}
      <View style={styles.networkBox}>
        <View style={styles.greenPulse} />
        <Text style={styles.networkText}>LOCAL LINK ACTIVE · PING 12ms</Text>
        <RefreshCw size={11} color="#7A1F2B" />
      </View>

      <TouchPointer x={150} y={48} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    padding: 14,
    justifyContent: 'space-between',
  },
  header: {
    paddingBottom: 4,
  },
  stepperText: {
    fontSize: 9.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  screenTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FDBA74',
    padding: 10,
    marginVertical: 4,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EA580C',
  },
  statusTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C2410C',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  statusSub: {
    fontSize: 8.5,
    color: '#7C2D12',
    fontFamily: 'Poppins_400Regular',
    lineHeight: 12,
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 8,
  },
  examineeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7A1F2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  examineeName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  examineeId: {
    fontSize: 8.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  seatBadge: {
    backgroundColor: '#F5EFE6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  seatBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#7A1F2B',
  },
  downloadBar: {
    gap: 4,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  downloadLabel: {
    fontSize: 8.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  downloadPercent: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#16A34A',
    fontFamily: 'Poppins_500Medium',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#E8DFD3',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
    backgroundColor: '#16A34A',
  },
  rulesCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 3,
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  rulesTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  ruleItem: {
    fontSize: 8.5,
    color: '#554A40',
    lineHeight: 12,
    fontFamily: 'Poppins_400Regular',
  },
  ruleBold: {
    fontWeight: '700',
    color: '#2C241C',
  },
  networkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EAF5EE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C5E0CF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  greenPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  networkText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.5,
    fontFamily: 'Poppins_600SemiBold',
  },
});
