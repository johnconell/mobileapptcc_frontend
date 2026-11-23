import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewToken } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { Question } from '@/shared/types';
import type { ExamNavMode } from '@/features/examinations/stores/examStore';
import { Row } from '@/shared/components/ui/primitives';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';

export interface ExamQuestionWorkspaceHandle {
  scrollToIndex: (index: number, animated?: boolean) => void;
  scrollToOffset: (offset: number, animated?: boolean) => void;
}

export interface ExamQuestionWorkspaceProps {
  questions: Question[];
  currentIndex: number;
  navMode: ExamNavMode;
  disabled?: boolean;
  renderQuestion: (question: Question, index: number) => React.ReactElement;
  onCurrentIndexChange: (index: number) => void;
  onVisibleIndexChange?: (index: number) => void;
  testID?: string;
  onTutorialScrollEnd?: () => void;
}

export const ExamQuestionWorkspace = forwardRef<ExamQuestionWorkspaceHandle, ExamQuestionWorkspaceProps>(
  function ExamQuestionWorkspace({
    questions,
    currentIndex,
    navMode,
    disabled = false,
    renderQuestion,
    onCurrentIndexChange,
    onVisibleIndexChange,
    testID,
    onTutorialScrollEnd,
  }, forwardedRef) {
    const { theme } = useThemeTokens();
    const listRef = useRef<FlatList<Question>>(null);
    const singleMode = navMode === 'one_at_a_time';
    const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, questions.length - 1));
    const data = singleMode ? (questions[safeIndex] ? [questions[safeIndex]] : []) : questions;

    useImperativeHandle(forwardedRef, () => ({
      scrollToIndex: (index, animated = true) => {
        if (singleMode) return;
        listRef.current?.scrollToIndex({ index, animated, viewPosition: 0 });
      },
      scrollToOffset: (offset, animated = true) => {
        if (singleMode) return;
        listRef.current?.scrollToOffset({ offset, animated });
      },
    }), [singleMode]);

    const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (singleMode) return;
      const first = viewableItems.find((item) => item.isViewable && typeof item.index === 'number');
      if (typeof first?.index === 'number') onVisibleIndexChange?.(first.index);
    }, [singleMode, onVisibleIndexChange]);

    const renderItem = useCallback(({ item }: { item: Question }) => {
      const index = singleMode ? safeIndex : questions.indexOf(item);
      return <View style={styles.item}>{renderQuestion(item, index)}</View>;
    }, [singleMode, safeIndex, questions, renderQuestion]);

    return (
      <View testID={testID} style={styles.root}>
        <FlatList
          ref={listRef}
          data={data}
          extraData={currentIndex}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!singleMode}
          removeClippedSubviews
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true });
          }}
          onMomentumScrollEnd={onTutorialScrollEnd}
          onScrollEndDrag={onTutorialScrollEnd}
        />
        {singleMode && questions.length > 0 ? (
          <Row style={styles.navigation}>
            <Pressable
              onPress={() => onCurrentIndexChange(Math.max(0, safeIndex - 1))}
              disabled={safeIndex <= 0 || disabled}
              accessibilityRole="button"
              accessibilityLabel="Previous question"
              style={[styles.navButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }, (safeIndex <= 0 || disabled) && styles.disabled]}
            >
              <ChevronLeft size={18} color={theme.accentText} strokeWidth={2.2} />
              <Text numberOfLines={1} style={[styles.navText, { color: theme.accentText }]}>Previous</Text>
            </Pressable>
            <Text numberOfLines={1} style={[styles.index, { color: theme.textSecondary }]}>{`Q. ${safeIndex + 1} of ${questions.length}`}</Text>
            <Pressable
              onPress={() => onCurrentIndexChange(Math.min(questions.length - 1, safeIndex + 1))}
              disabled={safeIndex >= questions.length - 1 || disabled}
              accessibilityRole="button"
              accessibilityLabel="Next question"
              style={[styles.navButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }, (safeIndex >= questions.length - 1 || disabled) && styles.disabled]}
            >
              <Text numberOfLines={1} style={[styles.navText, { color: theme.accentText }]}>Next</Text>
              <ChevronRight size={18} color={theme.accentText} strokeWidth={2.2} />
            </Pressable>
          </Row>
        ) : null}
      </View>
    );
  },
);

const viewabilityConfig = { itemVisiblePercentThreshold: 20 };

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  item: { marginBottom: 12 },
  navigation: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center', justifyContent: 'space-between' },
  navButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, gap: 4 },
  navText: { fontSize: 13, fontWeight: '600' },
  index: { fontSize: 12, fontWeight: '500' },
  disabled: { opacity: 0.45 },
});
