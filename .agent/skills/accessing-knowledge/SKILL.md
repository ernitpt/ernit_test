---
name: accessing-knowledge
description: Retrieves high-level architectural context and efficient documentation. Use when starting a new task or when the user asks about specific systems (Goals, Notifications, etc.) to ground the agent in the project's 'Truth'.
---

# Accessing Knowledge

## When to use this skill
- Starting a new session or major task.
- "How does the [X] system work?"
- "Give me context on [Y]"
- "What is the architecture for [Z]?"

## Workflow

1.  **Check the Map**: First, read `.agent/knowledge/system-map.md` (if it exists) to see what documentation is available.
2.  **Select Relevant Context**:
    - If the user asks about a specific system (e.g., "Notifications"), read `.agent/knowledge/notifications.md`.
    - If the user asks for *global* context, read `.agent/knowledge/architecture-overview.md`.
3.  **Summarize**: Present the key constraints, patterns, and data flows found in the document.
4.  **Confirm**: Ask if this matches the user's mental model or if they need deeper code investigation.

## Instructions
- **Do NOT** read source code immediately. Read the knowledge files first. They are the "Spec".
- If a knowledge file is missing or outdated, flag it: "The knowledge for [X] seems outdated relative to [File Y]. Shall I update it?"
- Treat `.agent/knowledge/` files as the **Source of Truth** for architectural patterns.

## Available Knowledge Map
(Agent: Always check `.agent/knowledge/` for the latest list)
- `system-map.md`: Index of all systems.
- `architecture-overview.md`: High-level stack and patterns.
- `[system-name].md`: Specifics for Hints, Goals, Coupons, etc.
