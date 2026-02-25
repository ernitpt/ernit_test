import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated } from 'react-native';
import { MotiView } from 'moti';
import Colors from '../../../config/colors';
import { PartnerGoalData } from '../goalCardUtils';

// ─── Skeleton ───────────────────────────────────────────────────────

const SkeletonBox: React.FC<{ width: number | string; height: number; borderRadius?: number; style?: object }> = ({
  width,
  height,
  borderRadius = 4,
  style,
}) => (
  <MotiView
    from={{ opacity: 0.3 }}
    animate={{ opacity: 1 }}
    transition={{ type: 'timing', duration: 800, loop: true }}
    style={[{ width: width as number, height, borderRadius, backgroundColor: '#e5e7eb' }, style]}
  />
);

const PartnerSkeleton: React.FC = () => (
  <View style={styles.partnerProgressRow}>
    <View style={[styles.partnerProgressCol, { alignItems: 'center' }]}>
      <SkeletonBox width={48} height={48} borderRadius={24} />
      <SkeletonBox width={80} height={14} borderRadius={7} style={{ marginTop: 10 }} />
    </View>
    <View style={styles.partnerDivider} />
    <View style={[styles.partnerProgressCol, { alignItems: 'center' }]}>
      <SkeletonBox width={48} height={48} borderRadius={24} />
      <SkeletonBox width={80} height={14} borderRadius={7} style={{ marginTop: 10 }} />
    </View>
  </View>
);

// ─── Activity Indicator ─────────────────────────────────────────────

const ActivityDot: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <MotiView
      from={{ opacity: 0.4, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1.2 }}
      transition={{ type: 'timing', duration: 600, loop: true }}
      style={styles.activityDot}
    />
  );
};

// ─── ValentinePartnerSelector ───────────────────────────────────────

interface ValentinePartnerSelectorProps {
  partnerGoalData: PartnerGoalData | null;
  isLoading: boolean;
  selectedView: 'user' | 'partner';
  onViewSwitch: (view: 'user' | 'partner') => void;
  currentUserName: string | null;
  currentUserProfileImage: string | null;
  valentinePartnerName: string | null;
  partnerProfileImage: string | null;
  partnerJustUpdated: boolean;
  motivationalNudge: string | null;
}

const ValentinePartnerSelector: React.FC<ValentinePartnerSelectorProps> = React.memo(({
  partnerGoalData,
  isLoading,
  selectedView,
  onViewSwitch,
  currentUserName,
  currentUserProfileImage,
  valentinePartnerName,
  partnerProfileImage,
  partnerJustUpdated,
  motivationalNudge,
}) => {
  if (isLoading && !partnerGoalData) {
    return (
      <View style={styles.valentineProgressContainer}>
        <PartnerSkeleton />
      </View>
    );
  }

  if (!partnerGoalData) return null;

  return (
    <View style={styles.valentineProgressContainer}>
      <View style={styles.partnerProgressRow}>
        {/* User Progress */}
        <Pressable
          onPress={() => onViewSwitch('user')}
          style={({ pressed }) => [
            styles.partnerProgressCol,
            selectedView === 'user' && styles.partnerProgressColSelected,
            selectedView !== 'user' && styles.partnerProgressColUnselected,
            pressed && styles.partnerProgressColPressed,
          ]}
        >
          <View style={styles.partnerAvatarContainer}>
            {currentUserProfileImage ? (
              <Image
                source={{ uri: currentUserProfileImage }}
                style={[styles.partnerAvatar, styles.partnerAvatarImage, styles.userAvatar]}
              />
            ) : (
              <View style={[styles.partnerAvatar, styles.userAvatar]}>
                <Text style={styles.partnerAvatarText}>
                  {currentUserName ? currentUserName.charAt(0).toUpperCase() : 'Y'}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={styles.partnerProgressLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Your Progress
          </Text>
        </Pressable>

        {/* Divider */}
        <View style={styles.partnerDivider} />

        {/* Partner Progress */}
        <Pressable
          onPress={() => onViewSwitch('partner')}
          style={({ pressed }) => [
            styles.partnerProgressCol,
            selectedView === 'partner' && styles.partnerProgressColSelected,
            selectedView !== 'partner' && styles.partnerProgressColUnselected,
            pressed && styles.partnerProgressColPressed,
          ]}
        >
          <View style={styles.partnerAvatarContainer}>
            {partnerProfileImage ? (
              <Image
                source={{ uri: partnerProfileImage }}
                style={[styles.partnerAvatar, styles.partnerAvatarImage]}
              />
            ) : (
              <View style={[styles.partnerAvatar, styles.partnerAvatarPlaceholder]}>
                <Text style={styles.partnerAvatarText}>
                  {valentinePartnerName ? valentinePartnerName.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
            <ActivityDot visible={partnerJustUpdated} />
          </View>
          <Text
            style={styles.partnerProgressLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {valentinePartnerName || 'Partner'}
          </Text>
        </Pressable>
      </View>

      {/* Motivational nudge */}
      {motivationalNudge && (
        <MotiView
          from={{ opacity: 0, translateY: -5 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400 }}
        >
          <Text style={styles.motivationalNudge}>{motivationalNudge}</Text>
        </MotiView>
      )}
    </View>
  );
});

ValentinePartnerSelector.displayName = 'ValentinePartnerSelector';

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  valentineProgressContainer: {
    marginTop: 16,
    marginBottom: 12,
    gap: 12,
  },
  partnerProgressRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  partnerProgressCol: {
    flex: 1,
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  partnerProgressColSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  partnerProgressColUnselected: {
    opacity: 0.65,
  },
  partnerProgressColPressed: {
    opacity: 0.85,
  },
  partnerAvatarContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  userAvatar: {
    backgroundColor: '#FFE5EF',
    borderColor: '#FF6B9D',
  },
  partnerAvatarPlaceholder: {
    backgroundColor: Colors.primarySurface,
    borderColor: '#C084FC',
  },
  partnerAvatarImage: {
    backgroundColor: Colors.primarySurface,
    borderColor: '#C084FC',
  },
  partnerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  partnerProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    height: 20,
  },
  partnerDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  activityDot: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  motivationalNudge: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
});

export default ValentinePartnerSelector;
