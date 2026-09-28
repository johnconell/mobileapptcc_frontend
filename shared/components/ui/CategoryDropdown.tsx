import React, { memo, useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, ChevronDown, LayoutGrid, X } from 'lucide-react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { Row } from './primitives';

export interface CategoryItem {
  key: string;
  name: string;
  answered: number;
  total: number;
}

export interface CategoryDropdownProps {
  categories: CategoryItem[];
  selectedCategory: string | null;
  onSelectCategory: (categoryKey: string | null) => void;
  disabled?: boolean;
}

function CategoryDropdownComponent({
  categories,
  selectedCategory,
  onSelectCategory,
  disabled = false,
}: CategoryDropdownProps) {
  const { theme, isDark } = useThemeTokens();
  const [isOpen, setIsOpen] = useState(false);

  const activeCategory = categories.find((c) => c.key === selectedCategory);
  const currentLabel = selectedCategory === null || selectedCategory === 'all'
    ? 'All'
    : (activeCategory?.name ?? selectedCategory);

  const totalAnswered = categories.reduce((sum, c) => sum + c.answered, 0);
  const totalQuestions = categories.reduce((sum, c) => sum + c.total, 0);

  const handleSelect = useCallback(
    (key: string | null) => {
      onSelectCategory(key);
      setIsOpen(false);
    },
    [onSelectCategory],
  );

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Category selector, current category is ${currentLabel}`}
        style={[
          styles.triggerBtn,
          {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
          },
        ]}
      >
        <Row style={styles.triggerLeft}>
          <LayoutGrid size={18} color={theme.accentText} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={[
              styles.triggerText,
              {
                color: theme.accentText,
              },
            ]}
          >
            {currentLabel}
          </Text>
        </Row>
        <ChevronDown size={18} color={theme.accentText} strokeWidth={2} />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
          <View style={[styles.modalOverlay, { backgroundColor: `${isDark ? theme.bg : theme.text}73` }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsOpen(false)}
            accessibilityLabel="Close category picker overlay"
          />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            {/* Top Drag Handle */}
            <View
              style={[
                styles.dragHandle,
                {
                  backgroundColor: theme.border,
                },
              ]}
            />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>
                Select Category
              </Text>
              <Pressable
                onPress={() => setIsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close category dropdown"
                  style={[
                  styles.closeBtn,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <X size={18} color={theme.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView style={styles.listContainer} bounces={false}>
              {/* "All" Category Row */}
              {(() => {
                const isAllSelected = selectedCategory === null || selectedCategory === 'all';
                return (
                  <Pressable
                    key="all"
                    onPress={() => handleSelect(null)}
                    style={[
                      styles.row,
                      {
                        backgroundColor: isAllSelected ? theme.accentSoft : theme.surfaceAlt,
                        borderColor: isAllSelected ? theme.ring : theme.border,
                        borderWidth: isAllSelected ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View style={styles.rowLeft}>
                      <Text
                        style={[
                          styles.rowTitle,
                          {
                            color: isAllSelected ? theme.accentText : theme.text,
                            fontWeight: isAllSelected ? '600' : '400',
                          },
                        ]}
                      >
                        All
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text
                        style={[
                          styles.rowCount,
                          {
                            color: isAllSelected ? theme.accentText : theme.textSecondary,
                          },
                        ]}
                      >
                        {`${totalAnswered}/${totalQuestions}`}
                      </Text>
                      {isAllSelected ? (
                        <Check size={18} color={theme.accent} strokeWidth={2.4} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })()}

              {/* Individual Categories */}
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => handleSelect(cat.key)}
                    style={[
                      styles.row,
                      {
                        backgroundColor: isSelected ? theme.accentSoft : theme.surfaceAlt,
                        borderColor: isSelected ? theme.ring : theme.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View style={styles.rowLeft}>
                      <Text
                        style={[
                          styles.rowTitle,
                          {
                            color: isSelected ? theme.accentText : theme.text,
                            fontWeight: isSelected ? '600' : '400',
                          },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text
                        style={[
                          styles.rowCount,
                          {
                            color: isSelected ? theme.accentText : theme.textSecondary,
                          },
                        ]}
                      >
                        {`${cat.answered}/${cat.total}`}
                      </Text>
                      {isSelected ? (
                        <Check size={18} color={theme.accent} strokeWidth={2.4} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export const CategoryDropdown = memo(CategoryDropdownComponent);

const styles = StyleSheet.create({
  triggerBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    flex: 1,
    gap: 8,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    flexGrow: 0,
  },
  row: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 15,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowCount: {
    fontSize: 13,
    fontWeight: '500',
  },
});
