# Akiva/webERP Enterprise Configuration Implementation TODO

## Phase 1: Control Foundation

- [x] Complete current-state architecture and dependency analysis.
- [x] Produce enterprise implementation blueprint.
- [x] Add enterprise configuration database schema migration.
- [x] Add unified enterprise configuration API controller.
- [x] Register enterprise configuration API routes.
- [x] Add fiscal-period enforcement to modern GL journal and bank posting APIs.
- [x] Add enterprise configuration frontend API/types.
- [x] Add enterprise configuration administration page.
- [x] Wire enterprise configuration page into application routing.
- [x] Add menu/dashboard entry points for enterprise configuration.
- [x] Add resilient Enterprise Controls menu fallback when DB seed/migration has not run yet.
- [x] Verify Enterprise Controls is emitted by the live menu API.
- [x] Remove duplicate Enterprise content sidebar and sync Enterprise page with main sidebar selections.
- [x] Add Grants and Donors route support and dynamic Enterprise page titles.
- [ ] Run backend migration/syntax checks.
  - [x] PHP syntax checks for new migration, controller, GL posting changes, and routes.
  - [x] Route registration check for enterprise configuration API.
  - [ ] Migration dry-run or execution against configured database. Blocked locally: PHP MySQL driver is unavailable.
- [x] Run frontend type/build checks.

## Phase 2: Live Operational Reporting

- [ ] Replace mock financial report data with live GL report APIs.
- [ ] Replace mock AR analysis with live debtor transaction/aging APIs.
- [ ] Replace mock AP analysis with live supplier transaction/aging APIs.
- [ ] Add report template maintenance and report preset screens.
- [ ] Add VAT/tax effective-rate maintenance screen.
- [ ] Add FX rate history maintenance screen.

## Phase 3: Enterprise Workflows

- [ ] Implement fiscal close/reopen approval workflow.
- [ ] Implement grant/donor budget reporting.
- [ ] Implement allocation batch generation and approval.
- [ ] Implement FX revaluation runs and posting workflow.
- [ ] Implement cash forecasting scenarios.
- [ ] Implement dashboard/widget assignment.
- [ ] Implement notification/reminder queue processing.

## Final Readiness

- [ ] Complete UAT scenarios for fiscal controls, reporting, tax, FX, AR/AP, allocations, dashboards, and audit.
- [ ] Verify role-based access and segregation-of-duties controls.
- [ ] Confirm all production menus point to live functionality or are clearly unavailable.
- [ ] Produce administrator runbook and go-live checklist.
