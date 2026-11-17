import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Wifi, Battery } from 'lucide-react-native';

interface DeviceMockupProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  interactive?: boolean;
  hideStatusBar?: boolean;
  hideHomeIndicator?: boolean;
}

export const DeviceMockup: React.FC<DeviceMockupProps> = ({
  children,
  width: customWidth,
  height: customHeight,
  hideStatusBar = false,
  hideHomeIndicator = false,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  // Responsive device frame sizing
  const defaultWidth = Math.min(windowWidth * 0.88, 330);
  const mockupWidth = customWidth ?? defaultWidth;
  // Standard 19.5:9 smartphone aspect ratio
  const mockupHeight = customHeight ?? Math.round(mockupWidth * 2.05);

  return (
    <View style={[styles.outerGlow, { width: mockupWidth, height: mockupHeight }]}>
      {/* Outer Phone Hardware Chassis with metallic titanium rim */}
      <View style={[styles.chassis, { width: mockupWidth, height: mockupHeight }]}>
        {/* Inner Screen Display */}
        <View style={styles.screenArea}>
          {/* Top Status Bar & Dynamic Island */}
          {!hideStatusBar ? (
            <View style={styles.statusBar} pointerEvents="none">
              <Text style={styles.clockText}>09:41</Text>
              {/* Dynamic Island Pill */}
              <View style={styles.dynamicIsland}>
                <View style={styles.cameraLens} />
                <View style={styles.sensorDot} />
              </View>
              <View style={styles.statusIcons}>
                <Wifi size={12} color="#18181B" strokeWidth={2.5} />
                <Battery size={14} color="#18181B" strokeWidth={2.5} />
              </View>
            </View>
          ) : null}

          {/* Child Real Application Screen Content */}
          <View style={styles.screenContent}>{children}</View>

          {/* Bottom Home Indicator Bar */}
          {!hideHomeIndicator ? (
            <View style={styles.homeIndicatorWrap} pointerEvents="none">
              <View style={styles.homeIndicator} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerGlow: {
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 28,
    elevation: 20,
  },
  chassis: {
    backgroundColor: '#0F1115',
    borderRadius: 42,
    borderWidth: 3.5,
    borderColor: '#383B44',
    padding: 7,
    overflow: 'hidden',
  },
  screenArea: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    borderRadius: 36,
    overflow: 'hidden',
    position: 'relative',
  },
  statusBar: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    zIndex: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  clockText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18181B',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: -0.2,
  },
  dynamicIsland: {
    width: 82,
    height: 22,
    backgroundColor: '#000000',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    gap: 4,
  },
  cameraLens: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#0F172A',
  },
  sensorDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: '#047857',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  screenContent: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  homeIndicatorWrap: {
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  homeIndicator: {
    width: 104,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#18181B',
    opacity: 0.3,
  },
});
