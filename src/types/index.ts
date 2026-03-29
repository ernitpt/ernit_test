import { NavigatorScreenParams } from '@react-navigation/native';
import { Timestamp } from 'firebase/firestore';


// Cart item type
export interface CartItem {
  experienceId: string;
  quantity: number;
}

// User types
export interface User {
  id: string;
  email: string;
  displayName?: string;
  userType: 'giver' | 'recipient';
  createdAt: Date;
  profile?: UserProfile;
  wishlist: Experience[];
  cart?: CartItem[];
  // Streak tracking (user-level, cross-goal)
  sessionStreak?: number;
  longestSessionStreak?: number;
  lastSessionDate?: string; // ISO date "YYYY-MM-DD"
  stripeCustomerId?: string;
}

// User Profile types
export interface UserProfile {
  id: string;
  userId: string;
  name: string;
  country: string;
  description?: string; // max 300 characters
  profileImageUrl?: string;
  activityCount: number; // TODO: not yet implemented — field is declared but never read or written in client code
  followersCount: number; // TODO: not yet implemented — field is declared but never read or written in client code
  followingCount: number; // TODO: not yet implemented — field is declared but never read or written in client code
  createdAt: Date;
  updatedAt: Date;
  badges?: ('founder' | 'pioneer')[];
  // Session reminder preferences
  reminderEnabled?: boolean;     // default true
  reminderTime?: string;         // "HH:MM" format, default "19:00"
  timezone?: string;             // IANA timezone, e.g. "Europe/Lisbon"
}

// Friend Request types
export interface FriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderProfileImageUrl?: string | null;
  recipientId: string;
  recipientName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  updatedAt: Date;
}

// Friend type
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendName: string;
  friendProfileImageUrl?: string | null;
  createdAt: Date;
}

// User Search Result
export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
  country: string;
  description: string;
  isFriend: boolean;
  hasPendingRequest: boolean;
}

// Hint categories for AI-generated hints
export type HintCategory =
  | 'what_to_bring'
  | 'what_to_wear'
  | 'physical_prep'
  | 'mental_prep'
  | 'atmosphere'
  | 'sensory'
  | 'activity_level'
  | 'duration_hints'
  | 'location_type'
  | 'geographic_clues';

// Experience categories
export type ExperienceCategory = 'adventure' | 'wellness' | 'creative';

// Experience data structure
export interface Experience {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: ExperienceCategory;
  price: number;
  imageUrl: string[];
  coverImageUrl: string;
  duration?: string;
  location?: string;
  partnerId: string;
  isRecommendedForValentines?: boolean; // Flag for Valentine's recommended experiences
  recommendedOrder?: number; // Optional: Order for recommended experiences (1, 2, 3, etc.)
  order?: number; // Position within category (set via admin panel)
  status?: 'published' | 'draft'; // Visibility toggle (draft = hidden from users)
  isFeatured?: boolean; // Admin-selectable: shown as hero card on home screen
}

// Gift/Experience Gift
export interface ExperienceGift {
  id: string;
  giverId: string;
  giverName: string;
  recipientId?: string;
  experienceId: string;
  // experience: Experience;
  personalizedMessage?: string;
  deliveryDate: Date;
  status: 'pending' | 'active' | 'claimed' | 'completed' | 'expired';
  createdAt: Date;
  payment: string;
  claimedAt?: Date;
  completedAt?: Date;
  claimCode: string;
  expiresAt?: Date; // ✅ Claim code expiration date
  partnerId?: string;
  paymentIntentId?: string;
  updatedAt?: Date;
  // Gift flow fields (set by createFreeGift / createDeferredGift)
  challengeType?: GiftChallengeType;
  revealMode?: GiftRevealMode;
  isMystery?: boolean;
  setupIntentId?: string;
  stripeCustomerId?: string;
  deferredAmount?: number;
  deferredCurrency?: string;
  pledgedExperience?: {
    experienceId: string;
    title: string;
    subtitle: string;
    description: string;
    category: string;
    price: number;
    coverImageUrl: string;
    imageUrl: string[];
    partnerId: string;
    location: string;
  };
  togetherData?: {
    goalName: string;
    duration: string;
    frequency: string;
    sessionTime: string;
    sameExperienceForBoth: boolean;
    giverGoalId?: string;  // ID of the giver's goal once created (set by Cloud Function)
    goalType?: string;     // Category/type of goal (e.g. 'gym', 'yoga', 'dance')
  };
  recipientGoalId?: string; // Fallback field set when bidirectional goal link cannot be written directly
  preferredRewardCategory?: string; // Category preference for mystery/deferred gifts
}

/** Core goal identity and description */
export interface GoalCore {
  id: string;
  userId: string;
  experienceGiftId: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  duration: number;
  startDate: Date | Timestamp;
  endDate: Date;
  isActive: boolean;
  isCompleted: boolean;
  isRevealed: boolean;
  location?: string;
  targetHours: number;
  targetMinutes: number;
  empoweredBy?: string;
  isMystery?: boolean;
  couponCode?: string;
  couponGeneratedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date | Timestamp;
  goalType?: 'gym' | 'yoga' | 'dance' | 'custom';
  paymentCommitment?: 'payOnCompletion' | 'paidUpfront' | null;
  venueId?: string;
  venueName?: string;
  venueLocation?: { lat: number; lng: number };
  claimCode?: string;
  pendingEditRequest?: {
    requestedTargetCount: number;
    requestedSessionsPerWeek: number;
    requestedAt: Date;
    requestedBy: string;
    message?: string;
  };
}

/** Weekly session tracking fields */
export interface GoalWeeklyTracking {
  targetCount: number;
  currentCount: number;
  sessionsPerWeek: number;
  weeklyCount: number;
  weeklyLogDates: string[];
  isWeekCompleted?: boolean;
  weekStartAt?: Date | null;
  plannedStartDate?: Date | null;
  lastNudgeLevel?: number;
}

/** Giver approval workflow fields */
export interface GoalApproval {
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'suggested_change';
  suggestedTargetCount?: number;
  suggestedSessionsPerWeek?: number;
  initialTargetCount?: number;
  initialSessionsPerWeek?: number;
  approvalRequestedAt?: Date | null;
  approvalDeadline?: Date | null;
  giverMessage?: string | null;
  receiverMessage?: string | null;
  giverActionTaken?: boolean;
}

/** Shared/Together challenge fields (renamed from GoalValentine for generality) */
export interface GoalShared {
  valentineChallengeId?: string;  // legacy Valentine challenge ID
  partnerGoalId?: string;
  challengeType?: 'shared';       // marks this goal as part of a shared challenge
  isLeader?: boolean;
  canProgress?: boolean;
  isFinished?: boolean;
  finishedAt?: Date;
  isUnlocked?: boolean;
  unlockedAt?: Date;
  unlockShown?: boolean;
  /** True when giver has completed their sessions but is waiting for the recipient to join/redeem */
  isReadyToComplete?: boolean;
}

/** Backward-compatibility alias — existing Valentine data keeps working */
export type GoalValentine = GoalShared;

/** Free Goal ("The Pledge") fields */
export interface GoalFreeGoal {
  isFreeGoal?: boolean;
  pledgedExperience?: {
    experienceId: string;
    title: string;
    subtitle: string;
    description: string;
    category: ExperienceCategory;
    price: number;
    coverImageUrl: string;
    imageUrl: string[];
    partnerId: string;
    location?: string;
  };
  preferredRewardCategory?: ExperienceCategory;
  // Discovery engine fields (category-path goals)
  discoveryPreferences?: Record<string, string>;
  discoveryQuestionsCompleted?: number;
  discoveredExperience?: {
    experienceId: string;
    title: string;
    subtitle: string;
    description: string;
    category: ExperienceCategory;
    price: number;
    coverImageUrl: string;
    imageUrl: string[];
    partnerId: string;
    location?: string;
  };
  discoveredAt?: Date;
  experienceRevealed?: boolean;
  experienceRevealedAt?: Date;
  pledgedAt?: Date;
  giftAttachedAt?: Date;
  giftAttachDeadline?: Date;
  empowerPending?: boolean;
}

export interface PersonalizedHint {
  type: 'text' | 'audio' | 'mixed' | 'image';
  text?: string;
  /** @deprecated Use text instead */
  hint?: string;
  audioUrl?: string;
  imageUrl?: string;
  duration?: number; // for audio
  giverName: string;
  createdAt: Date;
  forSessionNumber: number;
  /** Document ID (populated when fetched from Firestore) */
  id?: string;
  /** Session number alias (legacy — use forSessionNumber) */
  session?: number;
  /** Unix timestamp in ms (legacy — use createdAt) */
  date?: number;
}

/** Hint and nudge tracking */
export interface GoalHints {
  personalizedNextHint?: PersonalizedHint | null;
  hints?: (PersonalizedHint | { id?: string; session: number; hint?: string; date: number; text?: string; audioUrl?: string; imageUrl?: string; giverName?: string; createdAt?: Date; type?: PersonalizedHint['type']; duration?: number })[];
  lastNudgeSentAt?: Date | null;
  lastNudgeLevel?: number;
}

/** Full Goal type — intersection of all sub-types (backward-compatible) */
export type Goal = GoalCore & GoalWeeklyTracking & GoalApproval & GoalShared & GoalFreeGoal & GoalHints;

// Helper function to detect if a goal is self-gifted
export function isSelfGifted(goal: Goal): boolean {
  return goal.empoweredBy === goal.userId;
}

// Social Motivation (for Free Goals)
export interface Motivation {
  id: string;
  authorId: string;
  authorName: string;
  authorProfileImage?: string;
  message: string;
  type?: 'text' | 'audio' | 'image' | 'mixed';
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  targetSession?: number;
  createdAt: Date;
  seen: boolean;
}


// Individual goal segments (e.g., each workout in a month)
export interface GoalSegment {
  id: string;
  goalId: string;
  segmentNumber: number;
  isCompleted: boolean;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
}

// Goal activity log
export interface GoalActivity {
  id: string;
  goalId: string;
  segmentId: string;
  userId: string;
  activityType: 'segment_completed' | 'goal_started' | 'goal_completed' | 'reward_revealed';
  timestamp: Date;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// Goal statistics
export interface GoalStats {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  currentStreak: number;
  longestStreak: number;
  averageCompletionTime: number; // in days
}

// Progress tracking
export interface GoalProgress {
  id: string;
  goalId: string;
  userId: string;
  completedAt: Date;
  notes?: string;
}

// Session Records (subcollection: goals/{goalId}/sessions)
export interface SessionRecord {
  id: string;
  goalId: string;
  userId: string;
  timestamp: Date;
  duration: number;              // seconds elapsed when finished
  sessionNumber: number;         // 1-based overall session count
  weekNumber: number;            // which week this session was in
  mediaUrl?: string;             // Firebase Storage URL
  mediaType?: 'photo' | 'video';
  thumbnailUrl?: string;
  notes?: string;
  createdAt: Date;
  visibility?: 'friends' | 'private';  // Strava-style privacy: default 'friends'
}

// Feed Types
export type FeedPostType = 'goal_started' | 'session_progress' | 'goal_progress' | 'goal_completed' | 'goal_approved';
export type ReactionType = 'muscle' | 'heart' | 'like';

export interface FeedPost {
  id: string;
  userId: string;
  userName: string;
  userProfileImageUrl?: string;
  goalId: string;
  goalDescription: string;
  type: FeedPostType;

  // Progress data
  sessionNumber?: number;
  totalSessions?: number;
  progressPercentage?: number;
  weeklyCount?: number;
  sessionsPerWeek?: number;

  // Experience data (for goal_completed posts)
  experienceTitle?: string;
  experienceImageUrl?: string;
  partnerName?: string;
  experienceGiftId?: string;

  // Free Goal data
  isFreeGoal?: boolean;
  pledgedExperienceId?: string;
  pledgedExperiencePrice?: number;
  preferredRewardCategory?: ExperienceCategory;
  isMystery?: boolean;

  // Session media
  mediaUrl?: string;
  mediaType?: 'photo' | 'video';

  // Metadata
  createdAt: Date;
  isDeleted?: boolean;

  // Aggregated counts
  reactionCounts: {
    muscle: number;
    heart: number;
    like: number;
  };
  commentCount: number;
}

export interface Reaction {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userProfileImageUrl?: string;
  type: ReactionType;
  createdAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userProfileImageUrl?: string;
  text: string;
  createdAt: Date;
  updatedAt?: Date;
  likedBy?: string[];
}


//Notifications

export interface Notification {
  id?: string;
  userId: string; // The person who will see this notification
  title: string;
  message: string;
  type: 'gift_received' | 'goal_set' | 'goal_completed' | 'goal_progress' | 'friend_request' | 'goal_approval_request' | 'goal_change_suggested' | 'goal_approval_response' | 'personalized_hint_left' | 'post_reaction' | 'post_comment' | 'experience_empowered' | 'free_goal_milestone' | 'free_goal_completed' | 'goal_edit_request' | 'goal_edit_response'
    // Legacy Valentine notification types (kept for backward compat with existing data)
    | 'valentine_start' | 'valentine_unlock' | 'valentine_completion'
    // Together/Shared challenge notification types
    | 'shared_start' | 'shared_unlock' | 'shared_completion' | 'shared_session'
    // Payment notification types
    | 'payment_charged' | 'payment_failed' | 'payment_cancelled'
    // Shared challenge removal
    | 'shared_partner_removed'
    | 'motivation_received' | 'session_reminder' | 'weekly_recap' | 'experience_booking_reminder'
    | 'valentine_partner_progress';
  read: boolean;
  createdAt: Date | Timestamp;
  clearable?: boolean; // Whether notification can be cleared (default true)
  data?: {
    giftId?: string;
    goalId?: string;
    senderId?: string;
    recipientId?: string;
    experienceTitle?: string;
    friendRequestId?: string;
    senderName?: string;
    senderProfileImageUrl?: string;
    senderCountry?: string;
    // Approval-related fields
    initialTargetCount?: number;
    initialSessionsPerWeek?: number;
    suggestedTargetCount?: number;
    suggestedSessionsPerWeek?: number;
    giverMessage?: string;
    receiverMessage?: string;
    // Empower fields
    giverName?: string;
    giverId?: string;
    // Post reaction fields
    postId?: string;
    reactorNames?: string[];
    totalReactionCount?: number;
    mostRecentReaction?: 'muscle' | 'heart' | 'like';
    reactorProfileImageUrl?: string;
    sessionNumber?: number;
    // Free goal milestone/completion fields
    goalUserId?: string;
    goalUserName?: string;
    goalUserProfileImageUrl?: string;
    experienceId?: string;
    experiencePrice?: number;
    experienceCoverImageUrl?: string;
    milestone?: number;
    // Mystery flow
    isMystery?: boolean;
    // Category-only & weekly recap fields
    preferredRewardCategory?: ExperienceCategory;
    totalCompleted?: number;
    totalRequired?: number;
    // Booking reminder fields
    experienceGiftId?: string;
    experienceName?: string;
    // Post comment / goal progress fields
    recipientName?: string;
    userName?: string;
    // Payment recovery
    recoveryUrl?: string;
    // Goal approval response
    approved?: boolean;
    // Progress tracking
    totalSessionsDone?: number;
    totalSessionsRequired?: number;
    // Goal edit request fields
    requestedTargetCount?: number;
    requestedSessionsPerWeek?: number;
    message?: string;
  };
}


// AI Generated Hints
export interface Hint {
  id: string;
  goalId: string;
  experienceGiftId: string;
  progressPercentage: number;
  stage: 'early' | 'mid' | 'late' | 'reveal';
  hintText: string;
  category: ExperienceCategory;
  createdAt: Date;
}

// Partner User
export interface PartnerUser {
  id: string;
  userType: 'partner';
  isAdmin: boolean;
  name: string;
  createdFromInvite: string;
  email?: string; // System/auth email
  contactEmail?: string; // Customer contact email
  phone?: string;
  address?: string; // Physical address
  mapsUrl?: string;
  emailVerified?: boolean;
  status?: string;
  preferredContact?: 'whatsapp' | 'email' | 'both';
  createdAt?: Date;
  onboardedAt?: Date;
  updatedAt?: Date;
}

// Partner Coupon
export interface PartnerCoupon {
  code: string;
  status: 'active' | 'redeemed' | 'expired';
  userId: string;
  validUntil: Date;
  partnerId: string;
  goalId?: string;
  redeemedAt?: Date;
  createdAt?: Date;
}

// Challenge setup prefill data (from auth redirect)
export interface ChallengeSetupPrefill {
  goalType?: string;
  customGoal?: string;
  weeks?: number;
  sessionsPerWeek?: number;
  hours?: string;
  minutes?: string;
  experience?: Experience;
  plannedStartDate?: string;
  sessionMinutes?: number;
  showCustomTime?: boolean;
  preferredRewardCategory?: ExperienceCategory;
  paymentChoice?: 'payNow' | 'payLater' | 'free';
  currentStep?: number;
}

// Gift flow types
export type GiftChallengeType = 'solo' | 'shared';
export type GiftRevealMode = 'revealed' | 'secret';
export type GiftPaymentChoice = 'payNow' | 'payLater' | 'free';

export interface GiftFlowData {
  challengeType: GiftChallengeType;
  experience: Experience;
  revealMode: GiftRevealMode;
  paymentChoice: GiftPaymentChoice;
  // Together mode only:
  duration?: string;
  durationWeeks?: number;
  weeks?: number;
  frequency?: string;
  sessionsPerWeek?: number;
  sessionTime?: string;
  targetHours?: number;
  targetMinutes?: number;
  hours?: string | number;
  minutes?: string | number;
  sessionMinutes?: number;
  showCustomTime?: boolean;
  sameExperienceForBoth?: boolean;
  personalizedMessage?: string;
  preferredRewardCategory?: ExperienceCategory;
  selectedGoalType?: string;
  customGoalType?: string;
}

export interface GiftFlowPrefill extends Partial<GiftFlowData> {
  currentStep: number;
}

// Navigation types
export type RootStackParamList = {
  Landing: undefined;
  Auth: { mode?: 'signin' | 'signup'; fromModal?: boolean };
  CategorySelection: { prefilterCategory?: ExperienceCategory } | undefined;
  // Main: undefined;
  Profile: undefined;
  Journey: { goal: Goal };
  Goals: undefined;
  ExperienceCheckout: { experience?: Experience; cartItems?: CartItem[]; goalId?: string; isMystery?: boolean; giftId?: string };
  ExperienceDetails: { experience: Experience };
  GoalDetail: { goalId: string };
  GiverFlow: NavigatorScreenParams<GiverStackParamList>;
  RecipientFlow: NavigatorScreenParams<RecipientStackParamList>;
  GoalSetting: { experienceGift: ExperienceGift };
  Notification: undefined;
  Feed: { highlightPostId?: string } | undefined;
  AddFriend: undefined;
  FriendProfile: { userId: string };
  FriendsList: undefined;
  Cart: undefined;
  PurchasedGifts: undefined;
  Confirmation: { experienceGift: ExperienceGift; goalId?: string };
  ConfirmationMultiple: { experienceGifts: ExperienceGift[] };
  LoginPromptModal: undefined;
  AchievementDetail: { goal: Goal; experienceGift?: ExperienceGift; mode?: 'completion' | 'review' };
  ChallengeLanding: { mode?: 'self' | 'gift' } | undefined;
  MysteryChoice: { experience?: Experience; cartItems?: CartItem[] };
  ChallengeSetup: { prefill?: ChallengeSetupPrefill } | undefined;
  GiftLanding: { mode?: 'self' | 'gift' } | undefined;
  GiftFlow: { prefill?: GiftFlowPrefill } | undefined;
  DeferredSetup: { setupIntentClientSecret: string; experienceGift: ExperienceGift };
  AnimationPreview: undefined;
  HeroPreview: { mode?: 'self' | 'gift' } | undefined;
};

export type GiverStackParamList = {
  CategorySelection: { prefilterCategory?: ExperienceCategory } | undefined;
  ExperienceDetails: { experience: Experience };
  ExperienceCheckout: { experience?: Experience; cartItems?: CartItem[]; goalId?: string; isMystery?: boolean; giftId?: string };
  Confirmation: { experienceGift: ExperienceGift; goalId?: string };
  Cart: undefined;
};

export type RecipientStackParamList = {
  CouponEntry: { code?: string } | undefined;
  Profile: undefined;
};

// Analytics types
export type AnalyticsEventCategory =
  | 'navigation'
  | 'engagement'
  | 'conversion'
  | 'social'
  | 'error';

export type AnalyticsEventName =
  // Navigation
  | 'screen_view'
  // Engagement
  | 'button_click'
  | 'cta_shown'
  | 'cta_dismissed'
  | 'cta_accepted'
  | 'notification_tapped'
  | 'notification_dismissed'
  // Conversion
  | 'goal_creation_started'
  | 'goal_creation_completed'
  | 'checkout_started'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'coupon_redeemed'
  // Social
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_request_declined'
  | 'friend_removed'
  | 'friend_search'
  | 'feed_reaction'
  | 'feed_comment'
  | 'empower_started'
  | 'motivation_sent'
  | 'mystery_choice_selected'
  // Lifecycle
  | 'session_logged'
  | 'goal_approved'
  | 'gift_attached_to_goal'
  | 'gift_created'
  | 'gift_message_updated'
  // Landing & wizard flows
  | 'landing_page_viewed'
  | 'landing_mode_toggled'
  | 'landing_cta_tapped'
  | 'challenge_setup_started'
  | 'challenge_step_completed'
  | 'challenge_created'
  | 'gift_flow_started'
  | 'gift_step_completed'
  // Auth
  | 'signup_completed'
  | 'login_completed'
  | 'login_failed'
  // Session & goal lifecycle
  | 'session_start'
  | 'weekly_goal_completed'
  | 'goal_deleted'
  | 'goal_edited'
  | 'goal_edit_requested'
  | 'goal_edit_approved'
  | 'goal_edit_rejected'
  // Feed & discovery
  | 'feed_viewed'
  | 'app_open'
  // Error
  | 'error_boundary_triggered';

export interface AnalyticsEvent {
  eventName: AnalyticsEventName;
  category: AnalyticsEventCategory;
  properties: Record<string, unknown>;
  screenName?: string | null;
  userId: string | null;
  sessionId: string;
  timestamp: Date;
  userAgent: string;
  environment: 'development' | 'production';
}