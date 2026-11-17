import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Lock, Play, ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step6StartExamScreenProps {
  onStartExam?: () => void;
}

export const Step6_StartExamScreen: React.FC<Step6StartExamScreenProps> = ({ onStartExam }) => {
  const [pinned, setPinned] = useState(false);

  return (
    <View style={styles.container}>
      {/* Starting Header Banner */}
      <View style={styles.startBanner}>
        <CheckCircle2 size={16} color="#16A34A" />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>PROCTOR UNLOCKED EXAMINATION</Text>
          <Text style={styles.bannerSubtitle}>All candidates may now initiate testing.</Text>
        </View>
      </View>

      {/* Screen Pinning Dialog Simulation (Android BYOD Security) */}
      <View style={[styles.kioskCard, pinned && styles.kioskCardPinned]}>
        <View style={styles.kioskHeader}>
          <Lock size={14} color={pinned ? '#16A34A' : '#7A1F2B'} />
          <Text style={styles.kioskTitle}>
            {pinned ? 'Screen Pinned (Kiosk Active)' : 'Pin this screen?'}
          </Text>
        </View>
        <Text style={styles.kioskBody}>
          {pinned
            ? 'Your device is locked to the TCC Examination Application. Unpinning or exiting will be flagged to your proctor.'
            : 'Android requires screen pinning during the examination to prevent notifications and switching apps.'}
        </Text>

        {!pinned ? (
          <View style={styles.pinActionWrap}>
            <Pressable style={styles.gotItBtn} onPress={() => setPinned(true)}>
              <Text style={styles.gotItText}>GOT IT</Text>
            </Pressable>
            <TouchPointer x={120} y={18} />
          </View>
        ) : (
          <View style={styles.pinnedStatus}>
            <Text style={styles.pinnedStatusText}>✓ Security Enforcement Verified</Text>
          </View>
        )}
      </View>

      {/* Exam Details Preview Card */}
      <View style={styles.examDetailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Examination:</Text>
          <Text style={styles.detailValue}>TCC College Entrance Exam</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total Items:</Text>
          <Text style={styles.detailValue}>50 Multiple Choice Questions</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Duration:</Text>
          <Text style={styles.detailValueHighlight}>60:00 Minutes</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Auto-Submit:</Text>
          <Text style={styles.detailValue}>Enabled on timer completion</Text>
        </View>
      </View>

      {/* Start Button CTA */}
      <View style={styles.ctaWrap}>
        <Pressable style={styles.startBtn} onPress={onStartExam}>
          <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.startBtnText}>Start Examination</Text>
        </Pressable>
        {pinned ? <TouchPointer x={145} y={22} /> : null}
      </View>
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
  startBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF5EE',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C5E0CF',
    padding: 10,
  },
  bannerTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    fontSize: 8.5,
    color: '#166534',
    fontFamily: 'Poppins_400Regular',
  },
  kioskCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8DFD3',
    padding: 12,
    gap: 6,
    marginVertical: 4,
  },
  kioskCardPinned: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  kioskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kioskTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  kioskBody: {
    fontSize: 9,
    lineHeight: 13,
    color: '#554A40',
    fontFamily: 'Poppins_400Regular',
  },
  pinActionWrap: {
    position: 'relative',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  gotItBtn: {
    backgroundColor: '#7A1F2B',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  gotItText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  pinnedStatus: {
    paddingVertical: 4,
  },
  pinnedStatusText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#16A34A',
    fontFamily: 'Poppins_500Medium',
  },
  examDetailsCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 10,
    gap: 5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 9,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  detailValue: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2C241C',
    fontFamily: 'Poppins_500Medium',
  },
  detailValueHighlight: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#7A1F2B',
    fontFamily: 'Poppins_600SemiBold',
  },
  ctaWrap: {
    position: 'relative',
    marginTop: 4,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7A1F2B',
    borderRadius: 10,
    paddingVertical: 11,
    shadowColor: '#7A1F2B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
