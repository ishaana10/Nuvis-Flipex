# Nuvis Flipex — AI Agent & Developer Guidelines (BoardUI Standard)

> **Official UI Component Library:** [BoardUI (GitHub: boardui/boardui)](https://github.com/boardui/boardui)  
> **Brand Identity:** Nuvis Flipex (Golden Theme: `#F5C542` / `amber-400` / metallic gradient)

## 1. UI Adoption & Design System Directives
From now on, all UI components, views, dialogs, and developer tools in this codebase must adopt **BoardUI**:
- **Source-based components:** Always place and import BoardUI primitives in `frontend/src/components/ui/*`.
- **Under the hood:** React Aria Components for accessibility, Tailwind CSS for styling, Remixicon/Lucide for icons.
- **Color Scheme:** Consistent dark/light dashboard theme with **Nuvis Flipex** signature golden accents (`.nuvis-brand-text`, `amber-400`, `amber-500`).
- **No ad-hoc inline styles:** Use Tailwind utility classes and BoardUI component tokens (`cx` / `cn`).

## 2. Customer Isolation Rules
Every database operation and storage access must respect multi-tenant customer isolation:
- All queries accessing publications, pages, hotspots, keys, or analytics MUST scope by `tenant_id` (or `user_id` when mapped).
- Files must be isolated in storage paths under `/storage/tenants/{tenant_id}/`.
- API keys are hashed with SHA-256 and verified through tenant context.
