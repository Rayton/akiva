# Accounts Payable Modernization Plan (webERP -> Akiva)

## Purpose
This implementation roadmap tracks the six core capabilities required to bring Akiva AP to modern standards while preserving webERP migration compatibility.

## Capability 1: Approval Workflow Matrix
- Tables: `ap_approval_policies`, `ap_approval_steps`, `ap_bill_approval_instances`, `ap_bill_approval_actions`.
- Rules by threshold, currency, and scope.
- Enforce "approved before payment" in AP payment posting.
- API endpoints (next iteration):
  - `GET /api/payables/approvals/inbox`
  - `POST /api/payables/bills/{bill}/submit-approval`
  - `POST /api/payables/approvals/{instance}/actions`

## Capability 2: 2-way/3-way Matching
- Add matching tables in next migration (`ap_bill_matches`, `ap_match_exceptions`, `ap_tolerance_policies`).
- Wire matching workflow to purchase orders and GRN data.

## Capability 3: Duplicate Detection + Exception Queue
- Tables introduced: `ap_duplicate_checks`, `ap_exceptions`.
- Rule model:
  - exact supplier + invoice number
  - near duplicate by supplier + amount + date window
- Queue UI/API for finance review.

## Capability 4: Aging + Cash Forecasting
- Add AP aging buckets and due-date forecast projections.
- Introduce snapshot tables once dashboard filters are finalized.

## Capability 5: Recurring Bills + Scheduled Payments
- Add recurring bill templates and payment run batches.
- Ensure idempotent scheduling and audit history for each generated bill.

## Capability 6: Credit Notes + Statement Reconciliation
- Add credit note lifecycle and allocation workflows.
- Add reconciliation workspace for supplier statements and disputes.

## Cross-cutting constraints
- All AP business tables must support soft deletes.
- All AP domain models and state transitions must be auditable.
- Migration schema remains explicit and deterministic to support future upgrade scripts from webERP.
