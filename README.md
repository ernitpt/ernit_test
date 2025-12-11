# Ernit MVP - Gamified Mobile App

Ernit is a gamified mobile app that connects personal achievements (goals) with reward experiences gifted by others.

## Features

### Giver Flow
- **Landing Page**: Logo + CTA ("Start" / "Claim Experience")
- **Authentication**: Firebase Auth integration
- **Category Selection**: Choose from Adventure, Relaxation, Food & Culture, Romantic Getaway, Foreign Trip
- **Experience List**: Browse experiences with images, descriptions, and pricing
- **Experience Details**: Add personalized message and delivery date
- **Confirmation**: Generate claim code and share with recipient

### Recipient Flow
- **Coupon Entry**: Enter claim code to unlock experience
- **Goal Setting**: Define personal goals (frequency, duration, target count)
- **Roadmap**: Track progress with timer and session completion
- **AI Hints**: Receive mysterious hints that become clearer as progress increases
- **Completion**: Unlock experience when goals are achieved

### AI Hint System
- **Progressive Reveals**: Hints become clearer as goal completion increases
- **Category-Based**: Different hint styles for each experience category
- **Stages**: Early (vague), Mid (sensory), Late (nearly obvious), Reveal (full experience)

## Tech Stack

- **React Native** (Expo)
- **React Navigation** (Native Stack)
- **Tailwind CSS** (NativeWind)
- **Context API** for state management
- **Firebase** (Auth, Firestore, Storage, Cloud Functions)
- **TypeScript**

## Project Structure

```
src/
├── components/          # Reusable UI components
├── screens/           # Screen components
│   ├── giver/         # Giver flow screens
│   └── recipient/      # Recipient flow screens
├── navigation/         # Navigation configuration
├── context/           # Context API for state management
├── services/          # Firebase and AI services
├── types/             # TypeScript type definitions
└── utils/             # Utility functions
```

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Update `src/services/firebase.ts` with your Firebase configuration
   - Enable Authentication, Firestore, and Storage in Firebase Console

3. **Start Development Server**
   ```bash
   npm start
   ```

4. **Run on Device/Simulator**
   - Scan QR code with Expo Go app
   - Or press 'i' for iOS simulator, 'a' for Android emulator

## User Flows

### Giver Flow
1. Landing → Auth → Category Selection → Experience List → Experience Details → Confirmation
2. Share claim code with recipient
3. Monitor recipient's progress (future feature)

### Recipient Flow
1. Coupon Entry → Auth → Goal Setting → Roadmap → Completion
2. Complete sessions to earn hints
3. Unlock experience when goals are achieved

## AI Hint Categories

- **Adventure**: Nature, motion, energy, adrenaline, freedom
- **Relaxation**: Calm, warmth, stillness, touch, peace
- **Food & Culture**: Taste, smell, sounds, tradition, place
- **Romantic Getaway**: Connection, atmosphere, intimacy, sunset
- **Foreign Trip**: Culture, monuments, geography, local life

## Mock Data

The app includes mock experiences for each category to demonstrate the full user flow. In production, this would be replaced with real data from Firestore.

## Future Enhancements

- Real Firebase integration
- OpenAI API integration for dynamic hints
- Push notifications
- Social sharing features
- Admin panel for experience management
- Payment processing
- Real-time progress tracking

## Development Notes

- All styling uses Tailwind CSS classes via NativeWind
- State management handled through Context API
- Navigation uses React Navigation v6
- TypeScript for type safety
- Firebase ready for production integration
