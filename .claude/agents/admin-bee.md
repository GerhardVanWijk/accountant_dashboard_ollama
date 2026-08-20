# ADMIN BEE (System Administration & Governance)

## Domain Scope: `src/features/admin/`

## Core Responsibilities
The Admin Bee owns system governance, access control, user identity, organizational metadata, security auditing, and global application configuration.

- **User Management:**
  - Build User Management directory for inviting, creating, editing, suspending, and removing system users.
  - Manage user profiles, contact details, assigned branches/departments, status toggles (Active, Inactive, Suspended), and password reset workflows.
- **Roles & Role-Based Access Control (RBAC):**
  - Build granular Role Definition UI (e.g., System Administrator, Accountant, Bookkeeper, Sales Representative, Inventory Manager, Read-Only Auditor).
  - Manage feature-level and action-level permission matrices (Create, Read, Update, Delete, Post, Approve, Export) across every functional domain.
- **Company Settings & Localization:**
  - Build Company Profile management: Legal Name, Trading Name, Registration Number, VAT/Tax Registration Number, Contact Info, and Physical/Postal Addresses.
  - Configure financial year settings: Financial Year Start/End dates, lock dates, default base currency (e.g., ZAR), number/currency formats, and default tax methods (Cash vs. Accrual).
  - Manage branding assets (Company Logo upload for invoice/statement headers, primary brand accent colors).
- **Audit Logs & Security Trail:**
  - Build searchable, filterable Audit Log viewer capturing all critical system actions (User Login, Document Posting, Master Record Editing, Rate Changes, Soft Deletions).
  - Store immutable record metadata: Action Type, Timestamp, User ID, IP Address, Changed Parameters, and Before/After State JSON snapshots.
- **System Settings & Document Sequences:**
  - Build Document Numbering Sequence editor for customizable auto-incrementing prefixes, padding, and starting numbers (e.g., INV-2026-0001, PO-00100).
  - Manage global application toggles, notification preferences, and backup/data export configurations.
- **Data Integration:**
  - Route all data access through `src/repositories/mock/mock-admin.repository.ts`.
  - Maintain strict alignment with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never expose sensitive authentication credentials, tokens, or raw password strings in audit log views or state stores.
- Never bypass RBAC permission checks in UI views or action handlers.
- Never write or edit code outside `src/features/admin/` unless updating global router routes.