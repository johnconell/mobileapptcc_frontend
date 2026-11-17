import React from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, Award } from 'lucide-react-native';

interface TutorialControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onJumpToStep: (stepNumber: number) => void;
  onFinish: () => void;
  onExit: () => void;
}

export const TutorialControls: React.FC<TutorialControlsProps> = ({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onJumpToStep,
  onFinish,
  onExit,
}) => {
  const isFirst = currentStep === 1;
  const isLast = currentStep === totalSteps;

  return (
    <View style={styles.container}>
      {/* Horizontal Step Selector Pill Carousel */}
      <View style={styles.stepTrackWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepTrackContent}
        >
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((num) => {
            const isActive = num === currentStep;
            return (
              <Pressable
                key={num}
                style={[styles.stepDot, isActive && styles.stepDotActive]}
                onPress={() => onJumpToStep(num)}
                accessibilityRole="button"
                accessibilityLabel={`Jump to step ${num}`}
              >
                {isActive ? (
                  <Text style={styles.stepDotText}>{num}</Text>
                ) : (
                  <View style={styles.stepDotInner} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Primary Action Buttons Row */}
      <View style={styles.buttonRow}>
        {/* Back Button */}
        <Pressable
          style={[styles.backBtn, isFirst && styles.backBtnDisabled]}
          disabled={isFirst}
          onPress={onPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous Step"
        >
          <ChevronLeft size={16} color={isFirst ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
          <Text style={[styles.backBtnText, isFirst && styles.backBtnTextDisabled]}>Back</Text>
        </Pressable>

        {/* Step Indicator Counter */}
        <View style={styles.counterWrap}>
          <Text style={styles.counterText}>
            Step {currentStep} of {totalSteps}
          </Text>
        </View>

        {/* Next / Get Started Button */}
        {isLast ? (
          <Pressable
            style={styles.finishBtn}
            onPress={onFinish}
            accessibilityRole="button"
            accessibilityLabel="Get Started"
          >
            <Award size={16} color="#FFFFFF" />
            <Text style={styles.finishBtnText}>Get Started</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.nextBtn}
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Next Step"
          >
            <Text style={styles.nextBtnText}>Next Step</Text>
            <ChevronRight size={16} color="#7A1F2B" />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    gap: 10,
  },
  stepTrackWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTrackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    width: 32,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  stepDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  stepDotText: {
    color: '#7A1F2B',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Poppins_600SemiBold',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  backBtnDisabled: {
    opacity: 0.4,
    borderColor: 'transparent',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Poppins_500Medium',
  },
  backBtnTextDisabled: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  counterWrap: {
    alignItems: 'center',
  },
  counterText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Poppins_500Medium',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  nextBtnText: {
    color: '#7A1F2B',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
});
