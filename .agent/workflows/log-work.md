---
description: How to log work to the changelog
---

After completing a task, feature, or bug fix, run the following command to document it in the changelog:

```bash
npm run log "type: description"
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance
- `refactor`: Code restructuring
- `style`: Formatting/Style
- `docs`: Documentation
- `perf`: Performance
- `test`: Tests

Examples:
- `npm run log "feat: added user profile screen"`
- `npm run log "fix: resolved login crash on android"`
