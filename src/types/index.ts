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
  onboardingStatus?: 'not_started' | 'completed' | 'skipped';
}

// User Profile types
export interface UserProfile {
  id: string;
  userId: string;
  name: string;
  country: string;
  description?: string; // max 300 characters
  profileImageUrl?: string;
  activityCount: number;
  followersCount: number;
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
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

// Experience categories
export type ExperienceCategory = 'adventure' | 'relaxation' | 'food-culture' | 'romantic-getaway' | 'foreign-trip';

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
  status: 'pending' | 'claimed' | 'completed';
  createdAt: Date;
  payment: string;
  claimedAt?: Date;
  completedAt?: Date;
  claimCode: string;
  expiresAt?: Date; // ✅ Claim code expiration date
  partnerId?: string;
  paymentIntentId?: string;
  updatedAt?: Date;
}

export interface Goal {
  id: string;
  userId: string;
  experienceGiftId: string;
  title: string;
  description: string;
  isWeekCompleted?: Boolean;
  /** Overall (weeks) */
  targetCount: number;          // total weeks to complete
  currentCount: number;         // weeks completed so far

  /** Per-week sessions */
  sessionsPerWeek: number;      // required sessions per anchored week
  weeklyCount: number;          // sessions logged in the current anchored week
  weeklyLogDates: string[];     // ISO "YYYY-MM-DD" strings for the current week's sessions

  /** Weekly cadence */
  frequency: 'daily' | 'weekly' | 'monthly'; // keep as-is; we use 'weekly'
  weekStartAt?: Date | null;   // anchor day for the recurring weekly window

  /** Misc / existing fields */
  duration: number;            // in days
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isCompleted: boolean;
  isRevealed: boolean;
  location?: string;
  targetHours: number;
  targetMinutes: number;
  suggestedTargetCount?: number; // Giver's suggested weeks
  suggestedSessionsPerWeek?: number; // Giver's suggested sessions per week
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'suggested_change';
  initialTargetCount?: number;      // Original target count before any changes
  initialSessionsPerWeek?: number;  // Original sessions per week before any changes
  approvalRequestedAt?: Date | null;
  approvalDeadline?: Date | null;
  giverMessage?: string | null;
  receiverMessage?: string | null;
  giverActionTaken?: boolean; // Ensure giver can only act once
  couponCode?: string;              // Generated coupon code for completed goals
  couponGeneratedAt?: Date;         // When the coupon was generated
  empoweredBy?: string; // ID of the giver who empowered this goal
  personalizedNextHint?: PersonalizedHint | null;
  hints?: (PersonalizedHint | { session: number; hint: string; date: number })[];
  createdAt: Date;                  // When the goal was created
}

export interface PersonalizedHint {
  type: 'text' | 'audio' | 'mixed' | 'image';
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  duration?: number; // for audio
  giverName: string;
  createdAt: Date;
  forSessionNumber: number;
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
  metadata?: Record<string, any>;
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

  // Metadata
  createdAt: Date;

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
}


//Notifications

export interface Notification {
  id?: string;
  userId: string; // The person who will see this notification
  title: string;
  message: string;
  type: 'gift_received' | 'goal_set' | 'goal_completed' | 'goal_progress' | 'friend_request' | 'goal_approval_request' | 'goal_change_suggested' | 'goal_approval_response' | 'personalized_hint_left' | 'post_reaction';
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
    // Post reaction fields
    postId?: string;
    reactorNames?: string[];
    totalReactionCount?: number;
    mostRecentReaction?: 'muscle' | 'heart' | 'like';
    reactorProfileImageUrl?: string;
    sessionNumber?: number;
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
}

// Navigation types
export type RootStackParamList = {
  Onboarding: undefined;
  Landing: undefined;
  Auth: { mode?: 'signin' | 'signup'; fromModal?: boolean };
  CategorySelection: undefined;
  // Main: undefined;
  Profile: undefined;
  Roadmap: { goal: Goal };
  Goals: undefined;
  ExperienceCheckout: { experience?: Experience; cartItems?: CartItem[] };
  ExperienceDetails: { experience: Experience };
  GoalDetail: { goalId: string };
  Completion: { goal: Goal; experienceGift: ExperienceGift };
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
  Confirmation: { experienceGift: ExperienceGift };
  ConfirmationMultiple: { experienceGifts: ExperienceGift[] };
  LoginPromptModal: undefined;
};

export type GiverStackParamList = {
  CategorySelection: undefined;
  ExperienceDetails: { experience: Experience };
  ExperienceCheckout: { experience?: Experience; cartItems?: CartItem[] };
  Confirmation: { experienceGift: ExperienceGift };
  Cart: undefined;
  ConfirmationMultiple: { experienceGifts: ExperienceGift[] };
};

export type RecipientStackParamList = {
  CouponEntry: { code?: string } | undefined;
  GoalSetting: { experienceGift: ExperienceGift };
  Roadmap: { goal: Goal };
  Completion: { goal: Goal; experienceGift: ExperienceGift };
};