<!--
Sync Impact Report:
- Version change: 0.0.0 → 1.0.0 (Initial Ratification)
- List of modified principles:
  - [PRINCIPLE_1_NAME] → I. Component-Driven & Modular Architecture
  - [PRINCIPLE_2_NAME] → II. Type Safety & Strict Contracts
  - [PRINCIPLE_3_NAME] → III. Test-First & Quality Assurance (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Performance & Accessibility (a11y) Standards
  - [PRINCIPLE_5_NAME] → V. Simplicity & YAGNI
- Added sections:
  - Technology & Security Constraints
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: None
- Follow-up TODOs: None
-->

# FTN Website Constitution

## Core Principles

### I. Component-Driven & Modular Architecture
UI components and functional modules MUST be self-contained, composable, and adhere to single-responsibility design. Business logic and state management MUST be decoupled from presentational components. Every shared component MUST provide explicit interface contracts (props/types) and documented usage examples.
*Rationale: Modularity prevents cascading regressions, enforces clean design system boundaries, and accelerates feature development.*

### II. Type Safety & Strict Contracts
TypeScript with strict mode enabled MUST be used across the entire codebase. Implicit `any` types and unjustified type assertions (`as unknown as ...`) are strictly prohibited. External data boundaries (API endpoints, form submissions, browser storage, environment variables) MUST be validated with schema definitions (e.g., Zod or equivalent runtime validators) before consumption.
*Rationale: Compile-time type safety combined with runtime boundary validation eliminates entire classes of runtime exceptions and establishes reliable system contracts.*

### III. Test-First & Quality Assurance (NON-NEGOTIABLE)
Automated testing MUST accompany all features, utilities, and core application flows. Critical user paths and shared utility libraries MUST maintain comprehensive unit and integration test coverage. Bug fixes MUST include a reproducing test before implementation. All automated tests MUST execute and pass cleanly in CI before merging.
*Rationale: Reliable test suites protect regressions, validate business logic, and enable confident, rapid refactoring.*

### IV. Performance & Accessibility (a11y) Standards
All user interfaces MUST meet WCAG 2.1 AA accessibility standards, including semantic HTML structure, full keyboard navigability, explicit ARIA roles/labels where necessary, and compliant color contrast ratios. Web performance MUST be treated as a core feature: optimize assets, minimize client bundle weight, and prioritize Core Web Vitals (LCP, FID/INP, CLS).
*Rationale: High accessibility and performance ensure inclusive, responsive, and search-engine-optimized experiences across diverse devices and networks.*

### V. Simplicity & YAGNI
Architectural and code complexity MUST always be justified by current, concrete requirements rather than hypothetical future needs. Solutions MUST favor standard web standards, native framework idioms, and minimal third-party dependencies over premature abstraction.
*Rationale: Unnecessary complexity increases cognitive overhead, maintenance burdens, and bug surface area.*

## Technology & Security Constraints

- **Stack Consistency**: Modern web framework conventions with strict linting (ESLint) and formatting (Prettier) rules enforced via pre-commit hooks and CI pipelines.
- **Security & Secrets**: Secrets, private credentials, and API keys MUST NEVER be committed to source control or exposed to the client-side bundle. All inputs MUST be sanitized to prevent XSS and injection vulnerabilities.
- **Dependency Hygiene**: Adding external dependencies requires evaluation for bundle impact, security posture, license compatibility, and active maintenance.

## Development Workflow & Quality Gates

- **Specification & Planning**: Non-trivial changes MUST follow the Spec-Kit workflow (Specifying requirements, Implementation Planning, Task Breakdown, Execution, and Verification).
- **Branching & PR Discipline**: All changes MUST be introduced via topic branches with descriptive commit messages following Conventional Commits.
- **Merge Criteria**: A pull request MUST have passing automated checks (linting, typechecks, tests, build) and peer review verification before merging into the main branch.

## Governance

This Constitution is the foundational governing document for the FTN Website project. It supersedes informal conventions and undocumented team practices. All pull requests, code reviews, and architectural proposals MUST adhere to the principles set forth herein.

- **Amendments**: Amendments require formal documentation, explicit justification, and consensus.
- **Versioning Policy**: Semantic versioning MUST be applied to this document:
  - **MAJOR**: Incompatible principle removals or foundational governance shifts.
  - **MINOR**: Addition of new principles, sections, or material expansion of guidelines.
  - **PATCH**: Non-semantic clarifications, wording refinements, and typo corrections.
- **Compliance**: Continuous compliance checks MUST be performed during automated workflows and code reviews.

**Version**: 1.0.0 | **Ratified**: 2026-08-18 | **Last Amended**: 2026-08-18
