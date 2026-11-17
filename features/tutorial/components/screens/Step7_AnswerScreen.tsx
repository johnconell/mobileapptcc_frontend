import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Flag, ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step7AnswerScreenProps {
  onNext?: () => void;
}

export const Step7_AnswerScreen: React.FC<Step7AnswerScreenProps> = ({ onNext }) => {
  const [selectedChoice, setSelectedChoice] = useState<'A' | 'B' | 'C' | 'D'>('B');
  const [isFlagged, setIsFlagged] = useState(false);

  const choices: Array<{ key: 'A' | 'B' | 'C' | 'D'; label: string }> = [
    { key: 'A', label: '120 km' },
    { key: 'B', label: '150 km' },
    { key: 'C', label: '180 km' },
    { key: 'D', label: '210 km' },
  ];

  return (
    <View style={styles.container}>
      {/* Top Exam Header with Timer */}
      <View style={styles.examHeader}>
        <View style={styles.timerBadge}>
          <Text style={styles.timerText}>⏱ 58:24 REMAINING</Text>
        </View>
        <Pressable
          style={[styles.flagBtn, isFlagged && styles.flagBtnActive]}
          onPress={() => setIsFlagged(!isFlagged)}
        >
          <Flag size={12} color={isFlagged ? '#D97706' : '#7A6E62'} fill={isFlagged ? '#D97706' : 'transparent'} />
          <Text style={[styles.flagText, isFlagged && styles.flagTextActive]}>
            {isFlagged ? 'Not Sure' : 'Flag'}
          </Text>
        </Pressable>
      </View>

      {/* Real Question Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.questionCounter}>Question 1 of 50</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>Mathematics</Text>
          </View>
        </View>

        <Text style={styles.questionText}>
          If a car travels at an average speed of 60 km/h, how far will it travel in 2 hours and 30
          minutes?
        </Text>

        {/* Options List (Interactive!) */}
        <View style={styles.choicesList}>
          {choices.map((item) => {
            const isSelected = selectedChoice === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.choiceRow, isSelected && styles.choiceRowSelected]}
                onPress={() => setSelectedChoice(item.key)}
              >
                <View style={[styles.choiceKey, isSelected && styles.choiceKeySelected]}>
                  <Text style={[styles.choiceKeyText, isSelected && styles.choiceKeyTextSelected]}>
                    {item.key}
                  </Text>
                </View>
                <Text style={[styles.choiceLabel, isSelected && styles.choiceLabelSelected]}>
                  {item.label}
                </Text>
                {isSelected ? <Check size={14} color="#7A1F2B" strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Bottom Question Navigation Bar */}
      <View style={styles.navBar}>
        <View style={styles.navBtnDisabled}>
          <ChevronLeft size={14} color="#A89E94" />
          <Text style={styles.navBtnTextDisabled}>Prev</Text>
        </View>

        <View style={styles.autosavePill}>
          <Text style={styles.autosaveText}>Autosaved locally ✓</Text>
        </View>

        <Pressable style={styles.navBtnNext} onPress={onNext}>
          <Text style={styles.navBtnTextNext}>Next</Text>
          <ChevronRight size={14} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Animated Pointer demonstrating selecting Option B */}
      <TouchPointer x={150} y={150} />
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
  examHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  timerBadge: {
    backgroundColor: '#FFF1F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timerText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#9F1239',
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFDF8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flagBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  flagText: {
    fontSize: 9.5,
    color: '#7A6E62',
    fontFamily: 'Poppins_500Medium',
  },
  flagTextActive: {
    color: '#D97706',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questionCounter: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  categoryBadge: {
    backgroundColor: '#F5EFE6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#7A1F2B',
  },
  questionText: {
    fontSize: 10.5,
    lineHeight: 15,
    color: '#1A1410',
    fontFamily: 'Poppins_500Medium',
  },
  choicesList: {
    gap: 6,
    marginTop: 2,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF7F2',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8DFD3',
    padding: 8,
  },
  choiceRowSelected: {
    borderColor: '#7A1F2B',
    backgroundColor: '#FFF8F8',
  },
  choiceKey: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9BDB0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  choiceKeySelected: {
    borderColor: '#7A1F2B',
    backgroundColor: '#7A1F2B',
  },
  choiceKeyText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2C241C',
  },
  choiceKeyTextSelected: {
    color: '#FFFFFF',
  },
  choiceLabel: {
    flex: 1,
    fontSize: 10,
    color: '#332A22',
    fontFamily: 'Poppins_400Regular',
  },
  choiceLabelSelected: {
    fontWeight: '600',
    color: '#7A1F2B',
    fontFamily: 'Poppins_500Medium',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  navBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F5EFE6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    opacity: 0.6,
  },
  navBtnTextDisabled: {
    fontSize: 9.5,
    color: '#A89E94',
    fontFamily: 'Poppins_500Medium',
  },
  autosavePill: {
    alignItems: 'center',
  },
  autosaveText: {
    fontSize: 8.5,
    color: '#16A34A',
    fontWeight: '600',
    fontFamily: 'Poppins_500Medium',
  },
  navBtnNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#7A1F2B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navBtnTextNext: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
});
