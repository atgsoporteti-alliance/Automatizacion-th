---
name: daily-change-report
description: >-
  Generates a consolidated daily engineering changelog report covering committed changes,
  uncommitted working-tree progress, verification test/build results, live endpoint checks,
  and a clickable file inventory saved as an artifact. Use when the user asks for
  "reporte de hoy", "reporte de cambios", "resumen del día", or daily engineering release notes.
---

# Daily Change Report (`reporte_cambios_YYYY_MM_DD.md`)

Generates an accurate, verifiable daily engineering report matching Alliance HCM reporting standards.

## Core Rules

1. **Report only observed facts:** Never invent commit hashes, file paths, test counts, or HTTP statuses. Always separate **committed & pushed changes** from **uncommitted WIP** in the working tree.
2. **Use Windows PowerShell 5.1 syntax:** Chain commands with `;` and explicit `$LASTEXITCODE` checks (never `&&`).
3. **Preserve clickable file links:** Reference every source file with `[basename](file:///absolute/path/with/forward/slashes)`.

## Procedure

1. **Collect git metrics and endpoint status:**
   Run the helper script for the target date (defaults to today):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents\skills\daily-change-report\scripts\collect_daily_changes.ps1
   ```
   To inspect a specific date:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents\skills\daily-change-report\scripts\collect_daily_changes.ps1 -Date 2026-11-27
   ```
2. **Verify current build and test status (unless already run after the last edit in this session):**
   ```powershell
   npm.cmd run typecheck; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
   npm.cmd run test --workspace=@alliance-hcm/api; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
   npm.cmd run build:web; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
   ```
   Record the exact suite count, passing test count, failing/skipped tests, and execution time from output.
3. **Assemble the Markdown report:**
   Follow the 5-section layout defined in [report_template.md](./resources/report_template.md):
   - **1. Resumen Ejecutivo:** Branch sync status, base..head commit volume, committed vs uncommitted counts, key milestones.
   - **2. Cronología de Commits:** Table ordered chronologically with hash, local time, commit type, description, and file/line delta.
   - **3. Detalle Técnico por Módulo / Entrega:** Grouped by feature or fix (`Database`, `Shared`, `Backend API`, `Frontend Web`, plus `WIP sin commit` if any files remain untracked/modified).
   - **4. Pruebas, Compilación y Verificación en Vivo:** Exact results of `typecheck`, Jest unit tests, Next.js/API builds, Cloud (`Render`/`Vercel`), and Local (`localhost:3000`, `localhost:4000`).
   - **5. Inventario Completo de Archivos:** All touched files grouped by workspace package with `(A)` Added, `(M)` Modified, or `(WIP)` status badges and `file:///` links.
4. **Save as User-Facing Artifact:**
   Write the file to `<appDataDir>\brain\<conversation-id>\reporte_cambios_<YYYY_MM_DD>.md` using `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: false`), then point the user cleanly to the artifact and highlight only essential takeaways.
