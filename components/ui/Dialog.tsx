import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radii, shadows } from '@/theme';
import { Button } from './Button';

interface DialogProps {
  visible: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

export function Dialog({ visible, title, description, children, onClose }: DialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify()} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  visible,
  title,
  description,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  loading,
  danger,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <Button
              title={cancelLabel}
              variant="outline"
              onPress={onCancel}
              style={styles.actionBtn}
              disabled={loading}
            />
            <Button
              title={confirmLabel}
              variant={danger ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.actionBtn}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 22,
    gap: 12,
    ...shadows.card,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: { flex: 1 },
});
