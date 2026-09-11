import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Hardware back only while this screen is focused.
 * Return true to consume the event, false to let the navigator pop.
 */
export function useHardwareBack(handler: () => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => handlerRef.current());
      return () => sub.remove();
    }, []),
  );
}
