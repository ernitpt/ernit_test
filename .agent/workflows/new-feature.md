---
description: Standard Protocol for building a New Feature
---

# 🚀 New Feature Workflow

Follow this recipe EXACTLY when the user asks for a new feature.

## 1. 🧠 Context & Planning (The "Measure Twice" Phase)
- [ ] **Check Knowledge**: Use `accessing-knowledge` skill. exist?
    - *Why?* Don't build duplicate auth systems or inconsistent UI.
- [ ] **Draft Plan**: Use `writing-plans` skill.
    - Create `implementation_plan.md`.
    - **CRITICAL**: Define the "Definition of Done".
- [ ] **Review**: Ask USER to approve the plan.

## 2. 🔨 Implementation (The "Cut Once" Phase)
- [ ] **Test-First**: Can you write a test case? (Use `test-driven-development` skill).
- [ ] **Code Standards**:
    - [ ] Skeleton loaders for async data?
    - [ ] Haptic/Visual feedback for actions?
    - [ ] Strict Types?
- [ ] **Step-by-Step**: Implement in small, verifiable chunks.

## 3. 🔍 Verification
- [ ] **Self-Correction**: Run `npx expo start` or tests.
- [ ] **Verify**: Use `verification-before-completion` skill to prove it works.

## 4. 📚 Knowledge Maintenance (The "Anti-Rot" Phase)
> **STOP**: Did you modify a core system (Auth, Payments, Goals, etc.)?

- [ ] **YES**: Update the corresponding file in `.agent/knowledge/`.
- [ ] **YES**: If you created a NEW system, create a new `knowledge/` file and update `system-map.md`.

## 5. 🏁 Finish Line
- [ ] **Changelog**: Run `npm run log "feat: <description>"`.
- [ ] **Notify**: Tell the user you are done and what you built.
