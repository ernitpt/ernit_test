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
  senderProfileImageUrl?: string;
  recipientId: string;
  recipientName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  updatedAt: Date;
}

// Friend relationship types
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friendName: string;
  friendProfileImageUrl?: string;
  createdAt: Date;
}

// User search result for friend discovery
export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  profileImageUrl?: string;
  country?: string;
  description?: string;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
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
  weeklyLogDates: string[];     // ISO "YYYY-MM-DD" strings for the current week’s sessions

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
  empoweredBy?: string;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  revealedAt?: Date;
  segments: GoalSegment[];
  hints?: {
    session: number;
    hint: string;
    date: number; // timestamp
  }[];
  // Goal approval fields
  approvalStatus?: 'pending' | 'approved' | 'suggested_change';
  initialTargetCount?: number; // Original goal weeks
  initialSessionsPerWeek?: number; // Original sessions per week
  suggestedTargetCount?: number; // Giver's suggested weeks
  suggestedSessionsPerWeek?: number; // Giver's suggested sessions per week
  approvalRequestedAt?: Date;
  approvalDeadline?: Date; // 24h from request
  giverMessage?: string; // Message from giver when approving/suggesting
  receiverMessage?: string; // Message from receiver when responding
  giverActionTaken?: boolean; // Ensure giver can only act once
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

//Notifications

export interface Notification {
  id?: string;
  userId: string; // The person who will see this notification
  title: string;
  message: string;
  type: 'gift_received' | 'goal_set' | 'goal_completed' | 'goal_progress' | 'friend_request' | 'goal_approval_request' | 'goal_change_suggested' | 'goal_approval_response';
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
  Goals: undefined;
  Completion: { goal: Goal; experienceGift: ExperienceGift };
  Profile: undefined;
};

export interface PartnerCoupon {
  id?: string;
  code: string;
  status: 'active' | 'redeemed';
  userId: string;
  validUntil: Date;
  partnerId: string;
  createdAt?: Date | Timestamp;
}

export interface PartnerUser {
  id: string;
  name: string;
  email: string;
  userType: 'partner';
  mapsUrl?: string;     // 👈 what you actually need
  createdAt?: any;      // optional, Firestore timestamp
  isAdmin?: boolean;
  address?: string;
}