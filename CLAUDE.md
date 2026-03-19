# 🤖 AI & Agent Protocols (CLAUDE.md)

> **Core Rule**: This file is the Source of Truth for all AI interactions. Read this first.

## 🧠 Memory & Knowledge
- **ALWAYS** check `.agent/knowledge/system-map.md` before starting a task.
- **ALWAYS** use the `accessing-knowledge` skill to retrieve context instead of reading code files blindly.
- **MAINTENANCE**: If you modify a core system (Goals, Auth, Notifications, etc.), you **MUST** update the corresponding file in `.agent/knowledge/` before finishing the task.
    - *Example*: If you add a new Notification Type, update `notifications-system.md`.

## 🚀 Deployment Protocol
- I deploy Cloud Functions and Firestore Rules MANUALLY.
- Provide specific `firebase deploy --only...` commands when infrastructure changes.

## 📝 Changelog Protocol
- After completing a task (bug fix, feature, refactor, etc.), ALWAYS run: `npm run log "type: message"`
- Types: `feat`, `fix`, `chore`, `refactor`, `style`, `docs`, `perf`, `test`.
- Example: `npm run log "feat: added new login screen"`
- This automatically updates `CHANGELOG.md` without consuming many tokens.

## 💎 Aesthetics & UX (Strict)
1.  **Skeleton Loaders**: MUST be used for all async/loading states. No spinning wheels.
2.  **Typography**: Use system fonts (Inter/SF Pro) properly scaled.
3.  **Feedback**: Actions (save, delete, update) must have haptic or visual feedback (toast/animation).
4.  Implement "Glassmorphism" or "Neumorphism" where appropriate.
5.  Ensure all forms have inline validation.

## 🎨 Design Token Enforcement
- **ALWAYS** use tokens from `src/config/` (Colors, Typography, Spacing, BorderRadius, Shadows).
- **NEVER** hardcode hex colors, font sizes, or spacing values in screen/component files.
- If a token doesn't exist for the value you need, **add it to the config file first**, then use it.
- **ALWAYS** use `<Button>` from `src/components/Button.tsx` for interactive button elements.
- **ALWAYS** use `<Card>` from `src/components/Card.tsx` for content container cards.
- **ALWAYS** use `<TextInput>` from `src/components/TextInput.tsx` for text inputs (has label, error, disabled states built-in).
- **ALWAYS** use `<Avatar>` from `src/components/Avatar.tsx` for user profile images (sizes: sm/md/lg, auto-fallback to initials).
- **ALWAYS** use `<EmptyState>` from `src/components/EmptyState.tsx` for empty list/content states.
- **ALWAYS** use `<BaseModal>` from `src/components/BaseModal.tsx` for modal dialogs (variants: center/bottom).
- Import pattern: `import Colors from '../config/colors';` (or `../../config/colors` from screens).

## 🛠️ Code Standards
- **Functional React**: Use Hooks (`useEffect`, `useCallback`) properly. Avoid Class components.
- **Types**: Strict TypeScript. No `any` unless absolutely necessary (and commented why).
- **Imports**: Use absolute paths or consistent relative paths. Avoid circular dependencies.
- **Security**:
    - **Firestore**: Never bypass security rules.
    - **Cloud Functions**: Validate all inputs (`httpsCallable`).
- **Input Sanitization**: Use `sanitizeText` from `src/utils/sanitization.ts` for ALL user-provided string inputs before writing to Firestore or displaying in untrusted contexts. Also available: `sanitizeEmail`, `sanitizeNumber`, `sanitizeUrl`, `sanitizeProfileData`, `sanitizeGoalData`, `sanitizeComment`. Import: `import { sanitizeText } from '../utils/sanitization';`.
- **Responsive Sizing**: Use `vh()` from `src/utils/responsive.ts` for layout dimensions that must scale with screen height. Do NOT use raw `Dimensions.get('window').height` arithmetic in screen files.

## 🧮 Model Strategy (Token Optimization)
- **Opus = Orchestrator**: Use the main Opus context for planning, complex reasoning, architectural decisions, debugging, and review.
- **Sonnet/Haiku = Executors**: When executing multi-step plans, delegate well-defined, mechanical subtasks to subagents via the Task tool with `model: "sonnet"` or `model: "haiku"`.
  - Use **Sonnet** for: file edits, implementing clearly defined steps, straightforward refactors, search/exploration.
  - Use **Haiku** for: simple lookups, quick searches, boilerplate generation, running commands.
- **Decision rule**: If the subtask can be described in a single clear sentence with no ambiguity, delegate it. If it requires judgment or context-heavy reasoning, keep it in Opus.
- **Never** delegate tasks that require understanding the full conversation context or making architectural choices.

## 🚀 Workflow
1.  **Plan**: Use `writing-plans` skill for complex tasks.
2.  **Debug**: Use `systematic-debugging` for bugs.
3.  **Log**: ALWAYS run `npm run log`.

## General Instructions
- Analyse the current codebase and understand the existing architecture.
- Implement new features following the existing architecture.
- Reuse code whenever it makes sense.
- Always implement with best security, performance, scalability, maintainability, testability, accessibility, and SEO practices.
