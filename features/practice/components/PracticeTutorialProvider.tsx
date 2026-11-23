import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { isPracticeTutorialTargetAllowed, PRACTICE_TUTORIAL_STEPS } from '@/features/practice/tutorialEngine';

type Rect = { x: number; y: number; width: number; height: number };
type TargetSource = 'screen' | 'modal';
type TargetNode = { node: { measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null; source: TargetSource };

interface TutorialContextValue {
  targetVersion: number;
  registerTarget: (id: string, node: TargetNode['node'], source: TargetSource) => void;
  targetRect: (id: string, callback: (rect: Rect) => void) => void;
  currentTarget: string | null;
  currentAction: boolean;
  currentSource: TargetSource;
  runTargetAction: (id: string, action: () => void) => void;
  advance: () => void;
  skip: () => void;
  pause: (paused: boolean) => void;
  remeasure: () => void;
  active: boolean;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function usePracticeTutorialTarget(id: string, source: TargetSource = 'screen') {
  const context = useContext(TutorialContext);
  const registerTarget = context?.registerTarget;
  const ref = useCallback((node: TargetNode['node']) => {
    registerTarget?.(id, node, source);
  }, [registerTarget, id, source]);
  return {
    ref,
    isActive: context?.active && context.currentTarget === id,
    run: (action: () => void) => context ? context.runTargetAction(id, action) : action(),
    remeasure: () => context?.remeasure(),
  };
}

export function PracticeTutorialProvider({ children }: { children: React.ReactNode }) {
  const tutorialActive = usePracticeStore((s) => s.tutorialActive);
  const tutorialIndex = usePracticeStore((s) => s.tutorialIndex);
  const tutorialPaused = usePracticeStore((s) => s.tutorialPaused);
  const advanceStore = usePracticeStore((s) => s.advanceTutorial);
  const skipStore = usePracticeStore((s) => s.skipTutorial);
  const pauseStore = usePracticeStore((s) => s.setTutorialPaused);
  const nodes = useRef(new Map<string, TargetNode>());
  const [targetVersion, setTargetVersion] = useState(0);
  const active = tutorialActive && !tutorialPaused;
  const step = PRACTICE_TUTORIAL_STEPS[tutorialIndex];

  const registerTarget = useCallback((id: string, node: TargetNode['node'], source: TargetSource) => {
    if (node) nodes.current.set(id, { node, source });
    else nodes.current.delete(id);
    setTargetVersion((value) => value + 1);
  }, []);
  const remeasure = useCallback(() => setTargetVersion((value) => value + 1), []);

  const targetRect = useCallback((id: string, callback: (rect: Rect) => void) => {
    const node = nodes.current.get(id)?.node;
    if (!node?.measureInWindow) return;
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) callback({ x, y, width, height });
    });
  }, []);

  const runTargetAction = useCallback((id: string, action: () => void) => {
    if (!active) { action(); return; }
    if (!isPracticeTutorialTargetAllowed(tutorialIndex, id)) return;
    if (step.final) {
      action();
      pauseStore(true);
      return;
    }
    action();
    advanceStore();
  }, [active, step, tutorialIndex, pauseStore, advanceStore]);

  const context = useMemo<TutorialContextValue>(() => ({
    targetVersion,
    registerTarget,
    targetRect,
    currentTarget: step?.target ?? null,
    currentAction: step?.action ?? false,
    currentSource: step?.source ?? 'screen',
    runTargetAction,
    advance: advanceStore,
    skip: skipStore,
    pause: pauseStore,
    remeasure,
    active,
  }), [registerTarget, targetRect, step, runTargetAction, advanceStore, skipStore, pauseStore, active, targetVersion, remeasure]);

  const backHandler = useCallback(() => {
    if (!active) return false;
    skipStore();
    return true;
  }, [active, skipStore]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', backHandler);
    return () => sub.remove();
  }, [backHandler]);

  return (
    <TutorialContext.Provider value={context}>
      <View style={styles.host}>
        {children}
        <CoachMarkHost source="screen" targetVersion={targetVersion} />
      </View>
    </TutorialContext.Provider>
  );
}

export function PracticeTutorialModalHost() {
  const context = useContext(TutorialContext);
  return <CoachMarkHost source="modal" targetVersion={context?.targetVersion ?? 0} />;
}

function CoachMarkHost({ source, targetVersion }: { source: TargetSource; targetVersion: number }) {
  const context = useContext(TutorialContext);
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<View>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipHeight, setTipHeight] = useState(0);
  const [shownIndex, setShownIndex] = useState(-1);
  const x = useSharedValue(0); const y = useSharedValue(0);
  const w = useSharedValue(0); const h = useSharedValue(0);
  const tipTop = useSharedValue(0); const tipOpacity = useSharedValue(0);
  const pulse = useSharedValue(0);
  const active = context?.active ?? false;
  const index = usePracticeStore((s) => s.tutorialIndex);
  const step = PRACTICE_TUTORIAL_STEPS[index];
  const isCorrectHost = context?.currentSource === source;

  const placeTip = useCallback((target: Rect, cardHeight: number) => {
    if (cardHeight <= 0) return;
    const topRoom = target.y - 26 - 10;
    const bottomRoom = height - target.y - target.height - 26 - 10;
    const canAbove = topRoom >= cardHeight;
    const canBelow = bottomRoom >= cardHeight;
    const lowerHalf = target.y + target.height / 2 > height / 2;
    let top = lowerHalf
      ? (canAbove ? target.y - 26 - cardHeight : target.y + target.height + 26)
      : (canBelow ? target.y + target.height + 26 : target.y - 26 - cardHeight);
    if (!canAbove && !canBelow) {
      top = topRoom >= bottomRoom ? target.y - 26 - cardHeight : target.y + target.height + 26;
    }
    return Math.max(10, Math.min(height - cardHeight - 10, top));
  }, [height]);

  const measure = useCallback(() => {
    if (!context || !step || !active || !isCorrectHost) {
      setRect(null);
      return;
    }
    context.targetRect(step.target, (windowRect) => {
      rootRef.current?.measureInWindow((rootX, rootY) => {
        const local = { ...windowRect, x: windowRect.x - rootX, y: windowRect.y - rootY };
        setRect(local);
        x.value = reducedMotion ? local.x - 5 : withTiming(local.x - 5, { duration: 350, easing: Easing.out(Easing.ease) });
        y.value = reducedMotion ? local.y - 5 : withTiming(local.y - 5, { duration: 350, easing: Easing.out(Easing.ease) });
        w.value = reducedMotion ? local.width + 10 : withTiming(local.width + 10, { duration: 350, easing: Easing.out(Easing.ease) });
        h.value = reducedMotion ? local.height + 10 : withTiming(local.height + 10, { duration: 350, easing: Easing.out(Easing.ease) });
        const top = placeTip(local, tipHeight);
        const resolvedTop = top ?? 10;
        tipTop.value = reducedMotion ? resolvedTop : withTiming(resolvedTop, { duration: 450, easing: Easing.bezier(0.3, 0.7, 0.2, 1) });
        setShownIndex(index);
        tipOpacity.value = reducedMotion ? 1 : withDelay(230, withTiming(1, { duration: 220 }));
      });
    });
  }, [context, step, active, isCorrectHost, reducedMotion, placeTip, tipHeight, index, x, y, w, h, tipTop, tipOpacity]);

  useEffect(() => {
    if (!active || !step || !isCorrectHost) { setRect(null); return; }
    tipOpacity.value = reducedMotion ? 0 : withTiming(0, { duration: 220 });
    const timer = setTimeout(() => { setRect(null); measure(); }, reducedMotion ? 0 : 220);
    return () => clearTimeout(timer);
  }, [active, index, step, isCorrectHost, targetVersion, width, height, measure, reducedMotion, tipOpacity]);

  useEffect(() => {
    if (reducedMotion || !active) { cancelAnimation(pulse); pulse.value = 0; return; }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
    return () => cancelAnimation(pulse);
  }, [active, reducedMotion, pulse]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvent, measure);
    const b = Keyboard.addListener(hideEvent, measure);
    return () => { a.remove(); b.remove(); };
  }, [measure]);

  const ringStyle = useAnimatedStyle(() => ({
    left: x.value, top: y.value, width: w.value, height: h.value,
    shadowRadius: reducedMotion ? 22 : 22 + pulse.value * 8,
    shadowOpacity: 0.55 - pulse.value * 0.18,
  }));
  const tipStyle = useAnimatedStyle(() => ({ top: tipTop.value, opacity: tipOpacity.value }));
  const displayedStep = PRACTICE_TUTORIAL_STEPS[shownIndex];

  if (!active || !step || !isCorrectHost || !rect || !displayedStep) return null;
  const left = Math.max(0, rect.x - 5);
  const top = Math.max(0, rect.y - 5);
  const right = Math.min(width, rect.x + rect.width + 5);
  const bottom = Math.min(height, rect.y + rect.height + 5);
  const targetIsAction = displayedStep.action;
  const blocker = (key: string, style: object) => <Pressable key={key} onPress={() => undefined} style={[styles.scrim, style]} />;

  return (
    <View ref={rootRef} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {blocker('top', { left: 0, top: 0, right: 0, height: top })}
      {blocker('left', { left: 0, top, width: left, bottom: Math.max(0, height - bottom) })}
      {blocker('right', { right: 0, top, left: right, bottom: Math.max(0, height - bottom) })}
      {blocker('bottom', { left: 0, right: 0, top: bottom, bottom: 0 })}
      {!targetIsAction ? blocker('target', { left, top, width: right - left, height: bottom - top, backgroundColor: 'transparent' }) : null}
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Animated.View
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (nextHeight !== tipHeight) setTipHeight(nextHeight);
          const nextTop = placeTip(rect, nextHeight);
          if (nextTop !== undefined) tipTop.value = reducedMotion ? nextTop : withTiming(nextTop, { duration: 450, easing: Easing.bezier(0.3, 0.7, 0.2, 1) });
        }}
        style={[styles.tip, { left: 12, right: 12 }, tipStyle]}
      >
        <View style={styles.meta}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((shownIndex + 1) / 11) * 100}%` }]} /></View><Text style={styles.counter}>{shownIndex + 1} of 11</Text></View>
        <Text style={styles.title}>{displayedStep.title}</Text>
        <Text style={styles.body}>{displayedStep.body}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => context?.skip()} accessibilityRole="button"><Text style={styles.skip}>Skip tutorial</Text></Pressable>
          {displayedStep.action ? <View style={styles.actionPill}><Text style={styles.actionText}>Tap the glowing item</Text></View> : <Pressable onPress={() => context?.advance()} style={styles.next}><Text style={styles.nextText}>Next</Text></Pressable>}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  scrim: { position: 'absolute', backgroundColor: 'rgba(70,45,50,0.34)', zIndex: 9000 },
  ring: { position: 'absolute', borderRadius: 20, borderWidth: 2, borderColor: '#F3D48A', backgroundColor: 'transparent', zIndex: 9001, shadowColor: '#F3D48A', shadowOffset: { width: 0, height: 0 }, shadowRadius: 22, shadowOpacity: 0.55, elevation: 12 },
  tip: { position: 'absolute', zIndex: 9003, backgroundColor: '#FFFDF9', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 16, gap: 6, shadowColor: '#462830', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 32, elevation: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { height: 4, flex: 1, borderRadius: 4, backgroundColor: '#F1E8DA', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#8A3A46' },
  counter: { color: '#6F6266', fontSize: 11 },
  title: { marginTop: 4, color: '#8A3A46', fontSize: 15, fontWeight: '600' },
  body: { color: '#5A4A4E', fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 38 },
  skip: { color: '#6F6266', textDecorationLine: 'underline', fontSize: 12 },
  next: { backgroundColor: '#8A3A46', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9 },
  nextText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  actionPill: { backgroundColor: '#FBF0D6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { color: '#8A6A1F', fontSize: 12, fontWeight: '600' },
});

