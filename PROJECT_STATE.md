# Store Manager - Project State

## Overview
This file serves as the permanent memory for the store-manager project. AI agents must read this at the beginning of conversations and update it after significant changes.

## Core Stack
- **Frontend**: Next.js 16.x (App Router), React 19.x, TailwindCSS v4
- **Backend/Database**: Next.js API Routes, Supabase, PostgreSQL
- **Languages**: TypeScript (Strict Typing enforced, no `any`)

## Best Practices
1. **DRY & Reusability**: Extract repeated logic into shared hooks or utility functions. Components should be strictly modular and reusable.
2. **Type Safety**: Avoid `any`. Use types generated in `lib/database.types.ts`.
3. **Scripts**: Utility scripts in `scripts/` must be written in TypeScript (`.ts`) and executed using `tsx`.

## Key Business Logic & Features
*(Agents: Document key workflows here as you build or modify them. For example, how the Purchase Order workflow functions, role-based access rules, or syncing mechanisms.)*

- **Authentication**: Managed via Supabase (see `@supabase/ssr` implementation).
- **Scripts**: All `.js` scripts have been migrated to `.ts` for full type safety.
