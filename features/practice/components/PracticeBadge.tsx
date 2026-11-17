import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useExamineeRedesignTheme } from '@/shared/theme/examineeRedesign';

interface PracticeBadgeProps {
  label?: string;
  sublabel?: string;
}

export function PracticeBadge({
  label = 'PRACTICE MODE',
  sublabel = 'Offline Simulation · No Real Data Saved',
}: PracticeBadgeProps) {
  const theme = useExamineeRedesignTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.warningBackground,
          borderColor: theme.warningBorder,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: theme.gold }]}>
          <Sparkles size={14} color="#FFFFFF" />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]}>{label}</Text>
          {sublabel ? (
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
              {sublabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 15,
  },
});
