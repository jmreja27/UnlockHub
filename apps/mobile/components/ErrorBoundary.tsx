import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f1a', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>💥</Text>
          <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            Algo salió mal
          </Text>
          <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 }}>
            {this.state.error?.message ?? 'Se produjo un error inesperado.'}
          </Text>
          <Pressable
            style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, minHeight: 52 }}
            onPress={() => this.setState({ hasError: false, error: null })}
            accessibilityRole="button"
            accessibilityLabel="Reintentar"
          >
            <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 16 }}>Reintentar</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}
