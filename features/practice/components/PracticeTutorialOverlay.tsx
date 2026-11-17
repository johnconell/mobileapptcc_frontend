import React, { useContext } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ChevronRight, ChevronLeft, Sparkles, X } from 'lucide-react-native';
import { useExamineeRedesignTheme } from '@/shared/theme/examineeRedesign';

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export interface PracticeTutorialOverlayProps {
  visible: boolean;
  stepNumber: number;
  totalSteps: number;
  title: string;
  description: string;
  targetRect?: TargetRect | null;
  actionRequired?: boolean;
  actionHint?: string;
  onNext?: () => void;
  onBack?: () => void;
  onSkip: () => void;
  arrowDirection?: 'up' | 'down' | 'none';
  cardPlacement?: 'top' | 'bottom' | 'center';
}

export function PracticeTutorialOverlay({
  visible,
  stepNumber,
  totalSteps,
  title,
  description,
  targetRect,
  actionRequired = false,
  actionHint,
  onNext,
  onBack,
  onSkip,
  cardPlacement,
}: PracticeTutorialOverlayProps) {
  const insetsContext = useContext(SafeAreaInsetsContext);
  const insets = insetsContext ?? { top: 16, bottom: 16, left: 0, right: 0 };
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const theme = useExamineeRedesignTheme();

  if (!visible) return null;

  // Decide card placement:
  // If target element is in bottom half of screen (e.g. Next btn, Questions/Submit, Flag btn),
  // place tutorial card comfortably at the TOP so it doesn't cover the element.
  // If target element is at top (e.g. Mode toggle, Timer), place card at BOTTOM.
  let resolvedPlacement: 'top' | 'bottom' | 'center' = cardPlacement ?? 'center';
  if (!cardPlacement && targetRect && targetRect.width > 0 && targetRect.height > 0) {
    const targetCenterY = targetRect.y + targetRect.height / 2;
    resolvedPlacement = targetCenterY > screenHeight * 0.45 ? 'top' : 'bottom';
  }

  const containerStyle = [
    styles.cardContainer,
    resolvedPlacement === 'top' && {
      top: Math.max(insets.top, 10) + 70,
    },
    resolvedPlacement === 'bottom' && {
      bottom: Math.max(insets.bottom, 10) + 80,
    },
    resolvedPlacement === 'center' && {
      top: Math.max(insets.top + 50, screenHeight * 0.26),
    },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Floating Instructional Card without any blocking cutout boxes */}
      <View style={containerStyle} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.gold,
            },
          ]}
          pointerEvents="auto"
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.badgeRow}>
              <View style={[styles.stepBadge, { backgroundColor: theme.primarySoft }]}>
                <Sparkles size={13} color={theme.primary} />
                <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
                  {`Tutorial · Step ${stepNumber} of ${totalSteps}`}
                </Text>
              </View>
              {actionRequired ? (
                <View style={[styles.actionBadge, { backgroundColor: theme.warningBackground }]}>
                  <Text style={[styles.actionBadgeText, { color: theme.orange }]}>
                    Action required
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              onPress={onSkip}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <X size={18} color={theme.secondaryText} />
            </Pressable>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.description, { color: theme.secondaryText }]}>{description}</Text>

          {/* Action guidance if waiting for user input */}
          {actionRequired && actionHint ? (
            <View
              style={[
                styles.actionHintBox,
                {
                  backgroundColor: theme.warningBackground,
                  borderColor: theme.warningBorder,
                },
              ]}
            >
              <Text style={[styles.actionHintText, { color: theme.text }]}>
                👉 {actionHint}
              </Text>
            </View>
          ) : null}

          {/* Card Footer: Navigation & Skip */}
          <View style={styles.cardFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              onPress={onSkip}
              style={styles.skipBtn}
            >
              <Text style={[styles.skipBtnText, { color: theme.secondaryText }]}>Skip Tutorial</Text>
            </Pressable>

            <View style={styles.navButtons}>
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                  onPress={onBack}
                  style={[styles.navBtn, { backgroundColor: theme.secondaryCard }]}
                >
                  <ChevronLeft size={16} color={theme.text} />
                  <Text style={[styles.navBtnText, { color: theme.text }]}>Back</Text>
                </Pressable>
              ) : null}

              {onNext && !actionRequired ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next step"
                  onPress={onNext}
                  style={[styles.navBtnPrimary, { backgroundColor: theme.primary }]}
                >
                  <Text style={[styles.navBtnPrimaryText, { color: theme.white }]}>Next</Text>
                  <ChevronRight size={16} color={theme.white} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'stretch',
    zIndex: 999990,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actionBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_700Bold',
  },
  description: {
    fontSize: 13.5,
    lineHeight: 19.5,
    fontFamily: 'Poppins_400Regular',
  },
  actionHintBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionHintText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.25)',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipBtnText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    textDecorationLine: 'underline',
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  navBtnText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  navBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  navBtnPrimaryText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
});
