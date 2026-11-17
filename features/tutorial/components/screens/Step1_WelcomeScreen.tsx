import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { QrCode, Shield } from 'lucide-react-native';
import { SchoolLogo } from '@/shared/components/SchoolLogo';
import { TouchPointer } from '../TouchPointer';

interface Step1WelcomeScreenProps {
  onTapButton?: () => void;
}

export const Step1_WelcomeScreen: React.FC<Step1WelcomeScreenProps> = ({ onTapButton }) => {
  return (
    <View style={styles.container}>
      {/* Real Top Header Bar */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <View style={styles.proctorBtn}>
          <Shield size={10} color="#7A1F2B" />
          <Text style={styles.proctorBtnText}>Proctor</Text>
        </View>
        <View style={styles.updateBtn}>
          <Text style={styles.proctorBtnText}>Update</Text>
        </View>
      </View>

      {/* Hero Content */}
      <View style={styles.hero}>
        <SchoolLogo size="md" />
        <Text style={styles.schoolTitle}>TAGOLOAN COMMUNITY COLLEGE</Text>
        <Text style={styles.appName}>TCC Entrance Examination</Text>
        <Text style={styles.tagline}>Secure Offline Examination</Text>
      </View>

      {/* Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How to take the exam</Text>
        <Text style={styles.cardBody}>
          Connect to the examination Wi-Fi, then join with the proctor QR code or room code on one
          screen. Questions are sent from the proctor during the exam and removed after you submit.
        </Text>
      </View>

      {/* Version badge */}
      <View style={styles.versionWrap}>
        <Text style={styles.versionText}>v1.0.0 · Local Peer Engine Active</Text>
      </View>

      {/* Bottom Floating CTA Button */}
      <View style={styles.ctaWrap}>
        <Pressable style={styles.fab} onPress={onTapButton}>
          <QrCode size={16} color="#FFFFFF" />
          <Text style={styles.fabText}>Take Examination</Text>
        </Pressable>
        {/* Animated Touch Pointer on CTA */}
        <TouchPointer x={150} y={24} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
  },
  proctorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#7A1F2B',
    backgroundColor: '#FFFFFF',
  },
  updateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#7A1F2B',
    backgroundColor: '#FFFFFF',
  },
  proctorBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7A1F2B',
    fontFamily: 'Poppins_500Medium',
  },
  hero: {
    alignItems: 'center',
    gap: 4,
    marginVertical: 4,
  },
  schoolTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#7A1F2B',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1410',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 11,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 12,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1410',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 10,
    lineHeight: 15,
    color: '#554A40',
    fontFamily: 'Poppins_400Regular',
  },
  versionWrap: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  versionText: {
    fontSize: 9,
    color: '#A89E94',
    fontFamily: 'Poppins_400Regular',
  },
  ctaWrap: {
    position: 'relative',
    marginTop: 6,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7A1F2B',
    borderRadius: 12,
    paddingVertical: 12,
    shadowColor: '#7A1F2B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
