# AI Hint System Architecture

## Overview
Generates subtle, context-aware hints for "Unknown Experiences". Uses a hybrid Local-Remote approach.

## Components
1.  **Client (`AIHintService.ts`)**:
    - **Local Cache**: `AsyncStorage` caches generated hints by `goalId_sessionNumber` to save API costs.
    - **Firestore Sync**: Saves generated hints to `goalSessions/{goalId}/sessions/{number}` for cross-device persistence.
    - **Context Gathering**: Fetches *previous* hints for the goal to prevent repetition.
2.  **Backend (`aiGenerateHint.ts` Cloud Function)**:
    - **Model**: Uses OpenRouter (Llama 3 Instruct) or OpenAI (configurable).
    - **Prompt Engineering**:
        - **Difficulty Bands**: `vague` (0-20%) -> `thematic` -> `strong` -> `finale` (90%+).
        - **Categories**: `what_to_bring`, `atmosphere`, `physical_prep`, etc. Rotates or assigned.
        - **Anti-Repetition**: Explicitly forbids words used in previous hints.
    - **Rate Limiting**: 20 requests/hour per user, tracked in `rateLimits` collection.

## Data Flow
User requests hint -> Check Local Cache (Hit? Return) -> Check Firestore (Hit? Return) -> Call Cloud Function ->
  -> Cloud Function: Check Rate Limit -> Build Prompt with History -> Call LLM -> Return Hint
-> Client: Display -> Save to Firestore -> Save to Cache.

## Key Constraints
- **Subtlety**: The prompt is heavily optimized to *not* spoil the surprise.
- **Forbidden Words**: Hardcoded blocklists for common activities (e.g., "climbing", "wine") to prevent early reveals.
