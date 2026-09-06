<!--
Sync Impact Report:
- Version change: 1.0.0 -> 1.1.0
- List of modified principles:
  - Added III. Implementation & Execution Protocol (Phased Execution Constraint & Mandatory Phase Completion Report)
- Added sections:
  - Phase Execution Gate under Quality Gates & Review Workflow
- Removed sections:
  - None
- Follow-up TODOs:
  - Ensure all future implementation commands strictly pause after each phase and output the 4-part structured report.
-->

# FTN Website Constitution

## Core Principles

### I. Component Assembly Law (Aceternity UI & MCP First)
- **Tooling Rule**: Developers and AI agents MUST always use the `shadcn` MCP server to discover and install components.
- **Strict Library Reliance**: Rely strictly on Aceternity UI components. Do not design or hand-craft custom UI—treat Aceternity components as pre-built Lego blocks and assemble them as-is.
- **Zero Manual Style Tweaking**: Modifying default component styles, paddings, margins, or internal animations is strictly prohibited. Components MUST retain their original upstream presentation and behavior.
- **Rationale**: Enforcing standard assembly via MCP and Aceternity guarantees visual consistency, prevents regression bugs from custom style overrides, and accelerates reliable delivery.

### II. Copywriting & Content Rules
- **No Meta-Explanations**: Meta-explanations, category tags in parentheses (e.g., `(Category)` or `(Feature)`), and patronizing helper text are prohibited anywhere across the UI.
- **No Generic Filler**: Generic filler text (e.g., "Welcome to...", "Click here to view...") MUST NOT be used. UI copy must be concise, contextual, direct, and purposeful.
- **No Emojis in Navigation, Headings, or Buttons**: Emojis MUST NOT appear in navigation elements, section headings, titles, or buttons. Professional typography and clean iconography take precedence.
- **Rationale**: Clean, direct communication elevates product authority and eliminates visual clutter, maintaining a polished and professional presentation.

### III. Implementation & Execution Protocol
- **Phased Execution Constraint**: Execution MUST strictly proceed ONE phase/task at a time. After completing a phase, the agent MUST HALT immediately and MUST NOT proceed to subsequent phases autonomously.
- **Mandatory Phase Completion Report**: Whenever execution halts after completing a phase, the agent MUST deliver a structured summary covering:
  1. *Work Performed*: Comprehensive accounting of files created, configured, or updated in the phase.
  2. *Issues & Resolutions*: Complete log of any build errors, runtime failures, or dependency conflicts encountered and the exact technical steps taken to resolve them.
  3. *Aceternity & UI Compliance*: Explicit verification and justification that only unmodified Aceternity/shadcn components were installed and assembled, with zero custom CSS/style tampering.
  4. *Plan Alignment*: Direct justification demonstrating how the completed work adheres strictly to the architecture defined in `plan.md`.
- **Rationale**: Strict phased halts prevent runaway hallucinations, enforce architectural discipline, and provide transparent traceability at every milestone.

## UI Architecture & Assembly Constraints
- **Registry Discovery**: All component inquiries and additions MUST be queried against registries via the `shadcn` MCP server before introduction.
- **Composition over Customization**: Complex interfaces MUST be achieved by composing existing Aceternity modules rather than writing ad-hoc layout widgets or modifying Aceternity component internals.
- **Styling Discipline**: Global styling overrides that mutate Aceternity component aesthetics are rejected during quality review.

## Quality Gates & Review Workflow
- **Spec Kit Compliance**: All features must originate from structured Spec Kit specifications (`.specify/`) and strictly adhere to constitution principles during design, planning, and implementation.
- **Phase Execution Gate**: Each phase in `tasks.md` requires explicit human review and approval before advancing to the next phase.
- **UI Copy Audit**: Review every text string in deliverables to ensure absence of emojis in headings/navigation, elimination of filler phrases, and removal of parenthetical helper text.
- **Assembly Verification**: Code reviews must verify that components were installed via `shadcn` MCP workflows without custom style tampering.

## Governance
- **Supremacy**: This Constitution supersedes all informal practices, ad-hoc styling habits, or contradictory preferences.
- **Amendments**: Amendments require formal documentation, version increments, and explicit approval.
- **Versioning Policy**: Semantic versioning is strictly enforced (MAJOR for breaking principle removals/redefinitions, MINOR for new principles or expanded constraints, PATCH for wording and clarification).
- **Compliance Review**: All PRs, plans, specifications, and automated agents must verify strict compliance with these principles before merges or releases.

**Version**: 1.1.0 | **Ratified**: 2026-08-18 | **Last Amended**: 2026-08-18
