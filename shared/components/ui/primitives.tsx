import React, { type ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';

export function Row({
  style,
  children,
  ...props
}: React.ComponentProps<typeof View>) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]} {...props}>
      {children}
    </View>
  );
}

type ButtonVariant = 'outline' | 'filled' | 'flag';
type IconRenderer = (color: string) => ReactNode;

interface AppButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label?: string;
  icon?: IconRenderer;
  iconRight?: IconRenderer;
  variant?: ButtonVariant;
  height?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}

export function AppButton({
  label,
  icon,
  iconRight,
  onPress,
  variant = 'outline',
  height = 44,
  style,
  labelStyle,
  accessibilityLabel,
  children,
  disabled,
}: AppButtonProps) {
  const { theme } = useThemeTokens();
  const backgroundColor = variant === 'filled'
    ? theme.accent
    : variant === 'flag'
      ? theme.notSure.bg
      : theme.surfaceAlt;
  const borderColor = variant === 'filled'
    ? theme.accent
    : variant === 'flag'
      ? theme.notSure.border
      : theme.border;
  const foregroundColor = variant === 'filled'
    ? theme.onAccent
    : variant === 'flag'
      ? theme.notSure.text
      : theme.accentText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          height,
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          backgroundColor,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {icon ? <View style={{ marginRight: label ? 8 : 0 }}>{icon(foregroundColor)}</View> : null}
      {label ? (
        <Text numberOfLines={1} style={[{ color: foregroundColor, fontSize: 14, flexShrink: 1 }, labelStyle]}>
          {label}
        </Text>
      ) : null}
      {children}
      {iconRight ? <View style={{ marginLeft: 8 }}>{iconRight(foregroundColor)}</View> : null}
    </Pressable>
  );
}