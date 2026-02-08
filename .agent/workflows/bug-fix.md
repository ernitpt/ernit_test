---
description: Standard Protocol for Bug Fixes
---

# 🐞 Bug Fix Workflow

Follow this recipe EXACTLY when the user reports a bug.

## 1. 🕵️ Reproduction (The "Detective" Phase)
- [ ] **Research**: Use `accessing-knowledge` skill. How *should* it work?
- [ ] **Debug**: Use `systematic-debugging` skill.
    - **CRITICAL**: Do NOT touch code until you have a reproduction (or strong hypothesis).
    - Create a reproduction test case or script if possible.

## 2. 🧪 Implementation (The "Surgeon" Phase)
- [ ] **Test**: Write a failing test case (Red).
- [ ] **Fix**: Apply the fix (Green).
- [ ] **Verify**: Ensure the test passes.

## 3. 🔍 Regression Check
- [ ] **Scan**: Did this fix break anything else?
- [ ] **Verify**: Use `verification-before-completion` skill.

## 4. 📚 Knowledge Maintenance
- [ ] **Root Cause**: Was the docs wrong? Update `.agent/knowledge/` files.
- [ ] **New Pattern**: Did you add a new "Gotcha"? Record it.

## 5. 🏁 Finish Line
- [ ] **Changelog**: Run `npm run log "fix: <description>"`.
- [ ] **Notify**: Explain the root cause and the fix.
