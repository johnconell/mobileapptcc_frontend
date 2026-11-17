import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { X, Layers } from 'lucide-react-native';
import { TouchPointer } from '../TouchPointer';

interface Step8NavigatorScreenProps {
  onSelectQuestion?: (num: number) => void;
}

export const Step8_NavigatorScreen: React.FC<Step8NavigatorScreenProps> = ({ onSelectQuestion }) => {
  const [currentNum, setCurrentNum] = useState(7);

  // Status mapping for preview
  const answeredSet = new Set([1, 2, 3, 4, 5, 9, 10, 11, 12, 14]);
  const flaggedSet = new Set([6, 8]);

  const questions = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {/* Navigator Sheet Header */}
      <View style={styles.sheetHeader}>
        <View style={styles.dragBar} />
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Layers size={14} color="#7A1F2B" />
            <Text style={styles.sheetTitle}>Jump to Question</Text>
          </View>
          <View style={styles.closeBtn}>
            <X size={12} color="#7A6E62" />
          </View>
        </View>
      </View>

      {/* Real 4-Item Status Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#7A1F2B', borderColor: '#7A1F2B' }]} />
          <Text style={styles.legendText}>Answered</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
            <View style={styles.notSureDot} />
          </View>
          <Text style={styles.legendText}>Not Sure</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#EDEEF4', borderColor: '#DDD2C4' }]} />
          <Text style={styles.legendText}>Unanswered</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#FFFFFF', borderColor: '#0284C7', borderWidth: 2 }]} />
          <Text style={styles.legendText}>Current</Text>
        </View>
      </View>

      {/* Category Section */}
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>Mathematics & Logic</Text>
        <Text style={styles.categoryCount}>(10/20 Answered)</Text>
      </View>

      {/* 5-Column Question Grid (Interactive!) */}
      <View style={styles.grid}>
        {questions.map((num) => {
          const isAnswered = answeredSet.has(num);
          const isFlagged = flaggedSet.has(num);
          const isCurrent = num === currentNum;

          let bg = '#EDEEF4';
          let border = '#DDD2C4';
          let textColor = '#2C241C';
          let borderWidth = 1;

          if (isFlagged) {
            bg = '#FEF3C7';
            border = '#F59E0B';
            textColor = '#B45309';
          } else if (isAnswered) {
            bg = '#7A1F2B';
            border = '#7A1F2B';
            textColor = '#FFFFFF';
          }

          if (isCurrent) {
            border = '#0284C7';
            borderWidth = 2.5;
            if (!isAnswered && !isFlagged) {
              bg = '#FFFFFF';
            }
          }

          return (
            <Pressable
              key={num}
              style={[
                styles.gridButton,
                { backgroundColor: bg, borderColor: border, borderWidth },
              ]}
              onPress={() => {
                setCurrentNum(num);
                onSelectQuestion?.(num);
              }}
            >
              <Text style={[styles.gridNum, { color: textColor }]}>{num}</Text>
              {isFlagged ? <View style={styles.gridDot} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Footer Info Pill */}
      <View style={styles.infoPill}>
        <Text style={styles.infoText}>
          Tap any number in the grid to jump directly to that question.
        </Text>
      </View>

      {/* Touch Pointer over Question 7 */}
      <TouchPointer x={80} y={150} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    padding: 12,
    justifyContent: 'space-between',
  },
  sheetHeader: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  dragBar: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#DDD2C4',
    marginBottom: 2,
  },
  titleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFDF8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginVertical: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notSureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D97706',
  },
  legendText: {
    fontSize: 8,
    color: '#554A40',
    fontFamily: 'Poppins_500Medium',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  categoryTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2C241C',
    fontFamily: 'Poppins_600SemiBold',
  },
  categoryCount: {
    fontSize: 9,
    color: '#7A6E62',
    fontFamily: 'Poppins_400Regular',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  gridButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridNum: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  gridDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D97706',
  },
  infoPill: {
    backgroundColor: '#F5EFE6',
    borderRadius: 8,
    padding: 6,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 8.5,
    color: '#7A6E62',
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
});
