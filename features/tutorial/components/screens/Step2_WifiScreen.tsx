import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Wifi, Check, Lock, Info, ArrowLeft } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step2WifiScreenProps {
  onTapNetwork?: () => void;
}

export const Step2_WifiScreen: React.FC<Step2WifiScreenProps> = ({ onTapNetwork }) => {
  return (
    <View style={styles.container}>
      {/* OS Settings Header */}
      <View style={styles.header}>
        <ArrowLeft size={16} color="#18181B" />
        <Text style={styles.headerTitle}>Wi-Fi Settings</Text>
        <View style={styles.wifiToggle}>
          <View style={styles.toggleKnob} />
        </View>
      </View>

      {/* Network List */}
      <View style={styles.networkList}>
        <Text style={styles.sectionTitle}>AVAILABLE EXAM NETWORKS</Text>

        {/* Selected Room Network with Interactive Touch Highlight */}
        <Pressable style={styles.networkItemActive} onPress={onTapNetwork}>
          <View style={styles.networkIconActive}>
            <Wifi size={14} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.networkNameRow}>
              <Text style={styles.networkNameActive}>TCC_EXAM_ROOM_01</Text>
              <Check size={14} color="#16A34A" strokeWidth={3} />
            </View>
            <Text style={styles.networkStatus}>Connected · Local Exam Router</Text>
            <Text style={styles.networkSubWarning}>No internet required</Text>
          </View>
          <TouchPointer x={150} y={26} />
        </Pressable>

        {/* Other Normal Networks (Inactive) */}
        <View style={styles.networkItem}>
          <Wifi size={14} color="#9CA3AF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.networkName}>Campus_Guest_WiFi</Text>
            <Text style={styles.networkSecondary}>Saved</Text>
          </View>
          <Lock size={12} color="#9CA3AF" />
        </View>

        <View style={styles.networkItem}>
          <Wifi size={14} color="#9CA3AF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.networkName}>TCC_Faculty_Office</Text>
          </View>
          <Lock size={12} color="#9CA3AF" />
        </View>
      </View>

      {/* Offline Notice Card */}
      <View style={styles.offlineNotice}>
        <View style={styles.noticeHeader}>
          <Info size={14} color="#0284C7" />
          <Text style={styles.noticeTitle}>Local LAN Examination</Text>
        </View>
        <Text style={styles.noticeText}>
          The exam room network does not require internet connection. Your phone talks directly to
          your proctor's server laptop through Wi-Fi.
        </Text>
      </View>

      {/* Return to App Action */}
      <View style={styles.returnCard}>
        <Text style={styles.returnHint}>Connected to room router</Text>
        <Pressable style={styles.returnBtn} onPress={onTapNetwork}>
          <Text style={styles.returnBtnText}>Return to TCC App</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 14,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Poppins_600SemiBold',
  },
  wifiToggle: {
    width: 34,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  networkList: {
    gap: 8,
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  networkItemActive: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#16A34A',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  networkIconActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  networkNameActive: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Poppins_600SemiBold',
  },
  networkStatus: {
    fontSize: 9.5,
    color: '#16A34A',
    fontFamily: 'Poppins_500Medium',
  },
  networkSubWarning: {
    fontSize: 8.5,
    color: '#6B7280',
    fontFamily: 'Poppins_400Regular',
  },
  networkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  networkName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    fontFamily: 'Poppins_500Medium',
  },
  networkSecondary: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  offlineNotice: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 10,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  noticeTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0369A1',
    fontFamily: 'Poppins_600SemiBold',
  },
  noticeText: {
    fontSize: 9,
    lineHeight: 13,
    color: '#0C4A6E',
    fontFamily: 'Poppins_400Regular',
  },
  returnCard: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  returnHint: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '600',
    fontFamily: 'Poppins_500Medium',
  },
  returnBtn: {
    backgroundColor: '#7A1F2B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  returnBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
