import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
} from 'react-native';

type SkeletonAnimationContextValue = {
  opacity: Animated.AnimatedInterpolation<number>;
  reducedMotion: boolean | null;
  registerBlock: () => () => void;
};

export const SkeletonAnimationContext =
  createContext<SkeletonAnimationContextValue | null>(null);

export function SkeletonProvider({ children }: PropsWithChildren) {
  const [progress] = useState(() => new Animated.Value(0));
  const activeBlocks = useRef(0);
  const [hasBlocks, setHasBlocks] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  const registerBlock = useCallback(() => {
    activeBlocks.current += 1;
    if (activeBlocks.current === 1) setHasBlocks(true);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      activeBlocks.current = Math.max(0, activeBlocks.current - 1);
      if (activeBlocks.current === 0) setHasBlocks(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch((error) => {
        console.warn('Unable to read reduced-motion setting for skeletons:', error);
        if (active) setReducedMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    if (!hasBlocks || reducedMotion !== false) return undefined;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      progress.stopAnimation();
    };
  }, [hasBlocks, progress, reducedMotion]);

  const value = useMemo(
    () => ({
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      reducedMotion,
      registerBlock,
    }),
    [progress, reducedMotion, registerBlock],
  );

  return (
    <SkeletonAnimationContext.Provider value={value}>
      {children}
    </SkeletonAnimationContext.Provider>
  );
}
