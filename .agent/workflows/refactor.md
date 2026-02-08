---
description: Standard Protocol for Refactoring
---

# 🧹 Refactor Workflow

Follow this recipe EXACTLY when the user asks for a refactor or cleanup.

## 1. 🗺️ Analysis (The "Architect" Phase)
- [ ] **Map**: Use `accessing-knowledge` skill. What depends on this code?
- [ ] **Plan**: Use `writing-plans` skill.
    - Define the "Before" and "After" structure.
    - **Safety**: Identify potential breaking changes.

## 2. 🏗️ Execution (The "Builder" Phase)
- [ ] **Safe Moves**: Move/Rename code in atomic steps.
- [ ] **Types**: Ensure TypeScript compiles at every step.
- [ ] **Tests**: Run tests frequently.

## 3. 🔍 Verification
- [ ] **Verify**: Use `verification-before-completion` skill.
    - **CRITICAL**: Refactoring should NOT change behavior. Verify inputs/outputs match.

## 4. 📚 Knowledge Maintenance
- [ ] **Update Map**: Did you move files? Update `system-map.md`.
- [ ] **Update Docs**: Did you change class names? Update relevant `knowledge/*.md` files.

## 5. 🏁 Finish Line
- [ ] **Changelog**: Run `npm run log "refactor: <description>"`.
- [ ] **Notify**: Summarize what changed and why it's better.
