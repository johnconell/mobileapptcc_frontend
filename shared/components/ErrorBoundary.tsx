import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { colors } from '@/shared/theme';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time failures and offers safe retry options and transparent
 * diagnostics without breaking application stability.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', {
      errorName: error?.name || 'Error',
      errorMessage: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private handleGoHome = async () => {
    this.setState({ hasError: false, error: null });
    try {
      const { router } = await import('expo-router');
      router.replace('/');
    } catch {
      // ignore
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>
            {this.props.fallbackTitle ?? 'Unable to display this screen'}
          </Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage ??
              'The app encountered an unexpected error. Try again or return to the previous screen.'}
          </Text>

          {this.state.error ? (
            <View style={styles.errorDetailsBox}>
              <Text style={styles.errorDetailsTitle}>Error details:</Text>
              <Text style={styles.errorDetailsText} numberOfLines={6} selectable>
                {this.state.error.message || String(this.state.error)}
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={this.handleGoHome}>
              <Text style={styles.secondaryButtonText}>Return to Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.inkSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 14,
  },
  errorDetailsBox: {
    width: '100%',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorDetailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorDetailsText: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 18,
    fontFamily: 'Courier',
  },
});

export default ErrorBoundary;
