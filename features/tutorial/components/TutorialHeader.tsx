import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import type { TutorialStep } from '../types';
import { TCCMascot } from './TCCMascot';

interface TutorialHeaderProps {
  step: TutorialStep;
}

export const TutorialHeader: React.FC<TutorialHeaderProps> = ({ step }) => {
  return (
    <View style={styles.container}>
      {/* Eyebrow / Kicker Pill */}
      <View style={styles.kickerRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step.stepNumber}</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{step.badge}</Text>
        </View>
      </View>

      {/* Main Large Title */}
      <Text style={styles.title}>{step.title}</Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>{step.subtitle}</Text>

      {/* Bullet Points Glassmorphism Card */}
      <View style={styles.bulletsCard}>
        {step.bullets.map((bullet, idx) => (
          <View key={idx} style={styles.bulletRow}>
            <View style={styles.checkIconCircle}>
              <Check size={11} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={styles.bulletText}>{bullet.text}</Text>
          </View>
        ))}
      </View>

      {/* Mascot & Speech Bubble Pro-Tip (Chippy the Fox) */}
      <View style={styles.mascotSpeechRow}>
        <TCCMascot mood={step.mascotMood} size={76} />
        <View style={styles.speechBubble}>
          {/* Speech bubble tail pointer */}
          <View style={styles.bubbleTail} />
          <View style={styles.tipHeader}>
            <Sparkles size={13} color="#D97706" />
            <Text style={styles.tipTitle}>PROCTOR TIP</Text>
          </View>
          <Text style={styles.tipText}>{step.proTip}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stepBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
  },
  categoryBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  categoryBadgeText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 28,
    fontFamily: 'Poppins_600SemiBold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  bulletsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    padding: 12,
    gap: 9,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  checkIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1.5,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  mascotSpeechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(250, 204, 21, 0.45)',
  },
  bubbleTail: {
    position: 'absolute',
    left: -7,
    top: '50%',
    marginTop: -6,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderTopColor: 'transparent',
    borderBottomWidth: 6,
    borderBottomColor: 'transparent',
    borderRightWidth: 7,
    borderRightColor: '#FFFFFF',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  tipTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
  },
  tipText: {
    fontSize: 11,
    color: '#1F2937',
    lineHeight: 15,
    fontFamily: 'Poppins_500Medium',
  },
});
