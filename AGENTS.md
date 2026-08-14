<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Store Manager Guidelines

## 1. Mandatory Memory Retention
At the beginning of every conversation, **you must read `PROJECT_STATE.md`**.
Before finishing any significant feature or modification, **you must update `PROJECT_STATE.md`** with how the business logic was implemented. This prevents memory loss across sessions.

## 2. Best Practices (DRY & SOLID)
- **DRY:** Never repeat code. Consolidate logic into reusable functions, hooks, or components. 
- **Reusability:** UI components must be modular and prop-driven.
- **Strict Typing:** Avoid `any` at all costs. Ensure strict typing utilizing Supabase types where applicable. All scripts and core code must be `.ts` or `.tsx`.
