<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function show()
    {
        try {
            $currency = $this->currency();
            $cards = [
                'cashAtRisk' => $this->cashAtRiskCard(),
                'overdueReceivables' => $this->overdueReceivablesCard(),
                'approvalBacklog' => $this->approvalBacklogCard(),
                'stockExposure' => $this->stockExposureCard(),
            ];
            $cashFlowForecast = $this->cashFlowForecast();
            $workflowBottlenecks = $this->workflowBottlenecks();
            $supplierExposure = $this->supplierExposure();
            $modulePulse = $this->modulePulse();

            return response()->json([
                'success' => true,
                'data' => [
                    'companyName' => $this->companyName(),
                    'currency' => $currency,
                    'asOf' => now()->toDateString(),
                    'cards' => $cards,
                    'cashFlowForecast' => $cashFlowForecast,
                    'workflowBottlenecks' => $workflowBottlenecks,
                    'supplierExposure' => $supplierExposure,
                    'modulePulse' => $modulePulse,
                    'aiInsights' => $this->aiInsights($cards, $cashFlowForecast, $workflowBottlenecks, $supplierExposure, $modulePulse),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Dashboard data could not be loaded.',
            ], 500);
        }
    }

    private function cashAtRiskCard(): array
    {
        $horizonDays = 14;
        $native = $this->nativePayablesDueWithin($horizonDays);
        $legacy = $this->legacyPayablesDueWithin($horizonDays);
        $amount = round($native['amount'] + $legacy['amount'], 2);
        $count = $native['count'] + $legacy['count'];

        return [
            'value' => $amount,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'supplier bill', 'supplier bills') . ' due now or within ' . $horizonDays . ' days'
                : 'No supplier bills due in the next ' . $horizonDays . ' days',
            'status' => $count > 0 ? 'Due soon' : 'Clear',
            'tone' => $count > 0 ? 'danger' : 'success',
            'meta' => [
                'horizonDays' => $horizonDays,
                'nativeBills' => $native['count'],
                'legacyBills' => $legacy['count'],
            ],
        ];
    }

    private function aiInsights(array $cards, array $cashFlowForecast, array $workflowBottlenecks, array $supplierExposure, array $modulePulse): array
    {
        $insights = [];
        $cashAtRisk = $cards['cashAtRisk'] ?? [];
        $overdueReceivables = $cards['overdueReceivables'] ?? [];
        $approvalBacklog = $cards['approvalBacklog'] ?? [];
        $stockExposure = $cards['stockExposure'] ?? [];
        $forecastSummary = $cashFlowForecast['summary'] ?? [];
        $minimumReserve = (float) ($cashFlowForecast['minimumReserve'] ?? 0);
        $lowestProjectedCash = (float) ($forecastSummary['lowestProjectedCash'] ?? 0);
        $workflow = collect($workflowBottlenecks)->keyBy('id');
        $topSupplier = collect($supplierExposure['rows'] ?? [])->first();
        $glClose = collect($modulePulse)->firstWhere('id', 'glClose') ?? [];

        if ((int) ($cashAtRisk['count'] ?? 0) > 0) {
            $reservePressure = $minimumReserve > 0 && $lowestProjectedCash < $minimumReserve;
            $insights[] = $this->aiInsight([
                'id' => 'cash-sequencing',
                'priority' => 1,
                'title' => 'Sequence supplier payments around AR collection',
                'area' => 'Cash',
                'summary' => 'Supplier payments due soon should be staged against the cash forecast and current collection work.',
                'tone' => $reservePressure ? 'danger' : 'warning',
                'icon' => 'cash',
                'confidence' => $reservePressure ? 93 : 87,
                'impactScore' => $reservePressure ? 9.4 : 8.2,
                'riskScore' => $reservePressure ? 88 : 72,
                'financialImpact' => (float) ($cashAtRisk['value'] ?? 0),
                'affectedRecords' => $this->plural((int) ($cashAtRisk['count'] ?? 0), 'supplier bill', 'supplier bills'),
                'expectedOutcome' => $reservePressure ? 'Protects the reserve floor' : 'Preserves near-term working capital',
                'recommendedAction' => 'Review payment run timing',
                'approval' => 'CFO review',
                'sequence' => 'Before next supplier payment run',
                'reasoning' => 'The payment queue has near-term cash demand, so sequencing it after confirmed receipts reduces reserve pressure without blocking critical suppliers.',
                'evidence' => [
                    $this->plural((int) ($cashAtRisk['count'] ?? 0), 'bill', 'bills') . ' due within 14 days',
                    '30-day reserve ' . $this->metricMoney($minimumReserve),
                    'Lowest forecast cash ' . $this->metricMoney($lowestProjectedCash),
                ],
            ]);
        }

        if ((int) ($overdueReceivables['count'] ?? 0) > 0) {
            $insights[] = $this->aiInsight([
                'id' => 'receivables-collection',
                'priority' => 2,
                'title' => 'Prioritize overdue receivables before discretionary spend',
                'area' => 'Receivables',
                'summary' => 'Collection follow-up can improve cash cover before the next payable decision window.',
                'tone' => 'warning',
                'icon' => 'receivables',
                'confidence' => min(95, 82 + (int) ($overdueReceivables['count'] ?? 0)),
                'impactScore' => 8.0,
                'riskScore' => min(92, 62 + ((int) ($overdueReceivables['count'] ?? 0) * 3)),
                'financialImpact' => (float) ($overdueReceivables['value'] ?? 0),
                'affectedRecords' => $this->plural((int) ($overdueReceivables['count'] ?? 0), 'overdue invoice', 'overdue invoices'),
                'expectedOutcome' => 'Improves payment cover',
                'recommendedAction' => 'Escalate collection calls',
                'approval' => 'Credit control lead',
                'sequence' => 'Before approving non-critical AP',
                'reasoning' => 'Overdue customer balances are the most direct cash offset against supplier commitments due in the same operating window.',
                'evidence' => [
                    $this->plural((int) ($overdueReceivables['count'] ?? 0), 'invoice', 'invoices') . ' beyond credit terms',
                    'Open value ' . $this->metricMoney((float) ($overdueReceivables['value'] ?? 0)),
                ],
            ]);
        }

        $poApproval = $workflow->get('poApproval', []);
        if ((int) ($approvalBacklog['count'] ?? 0) > 0 || (int) ($poApproval['count'] ?? 0) > 0) {
            $approvalCount = max((int) ($approvalBacklog['count'] ?? 0), (int) ($poApproval['count'] ?? 0));
            $insights[] = $this->aiInsight([
                'id' => 'approval-expedite',
                'priority' => 3,
                'title' => 'Escalate approval backlog blocking procurement',
                'area' => 'Approvals',
                'summary' => 'Open approval items should be cleared before receiving and invoice matching queues widen.',
                'tone' => 'pending',
                'icon' => 'approval',
                'confidence' => min(96, 84 + $approvalCount),
                'impactScore' => 8.8,
                'riskScore' => min(90, 68 + ($approvalCount * 4)),
                'financialImpact' => (float) ($poApproval['value'] ?? 0),
                'affectedRecords' => $this->plural($approvalCount, 'approval item', 'approval items'),
                'expectedOutcome' => 'Unblocks replenishment workflow',
                'recommendedAction' => 'Route to approval owner',
                'approval' => 'Procurement director',
                'sequence' => 'Before GRN cut-off',
                'reasoning' => 'Approval aging is upstream of stock receipt, supplier exposure, and invoice matching, so clearing it reduces multiple downstream queues.',
                'evidence' => [
                    $this->plural($approvalCount, 'item', 'items') . ' waiting for decision',
                    'Approval value ' . $this->metricMoney((float) ($poApproval['value'] ?? 0)),
                ],
            ]);
        }

        if (is_array($topSupplier) && (float) ($topSupplier['value'] ?? 0) > 0) {
            $share = (float) ($topSupplier['share'] ?? 0);
            $overdueOrders = (int) ($topSupplier['overdueOrders'] ?? 0);
            $approvalAging = (int) ($topSupplier['approvalAging'] ?? 0);

            if ($share >= 35 || $overdueOrders > 0 || $approvalAging > 0) {
                $insights[] = $this->aiInsight([
                    'id' => 'supplier-concentration',
                    'priority' => 4,
                    'title' => 'Reduce top supplier commitment concentration',
                    'area' => 'Purchasing',
                    'summary' => 'The leading supplier has the highest open PO exposure and should be reviewed for delivery or approval risk.',
                    'tone' => $overdueOrders > 0 ? 'danger' : 'warning',
                    'icon' => 'supplier',
                    'confidence' => min(97, 78 + (int) round($share / 5) + $overdueOrders + $approvalAging),
                    'impactScore' => $share >= 50 ? 9.1 : 7.8,
                    'riskScore' => min(96, 55 + (int) round($share) + ($overdueOrders * 8) + ($approvalAging * 4)),
                    'financialImpact' => (float) ($topSupplier['value'] ?? 0),
                    'affectedRecords' => (string) ($topSupplier['supplier'] ?? 'Top supplier'),
                    'expectedOutcome' => 'Lowers concentration risk',
                    'recommendedAction' => 'Review supplier delivery exposure',
                    'approval' => 'Procurement lead',
                    'sequence' => 'Before new PO release',
                    'reasoning' => 'Supplier concentration raises fulfilment and cash risk when overdue orders or aging approvals sit with the same vendor.',
                    'evidence' => [
                        (string) ($topSupplier['supplier'] ?? 'Top supplier') . ' holds ' . $this->percentageLabel($share) . ' of exposure',
                        $this->plural((int) ($topSupplier['orders'] ?? 0), 'open order', 'open orders'),
                        (string) ($topSupplier['sla'] ?? 'On target'),
                    ],
                ]);
            }
        }

        if ((int) ($stockExposure['count'] ?? 0) > 0) {
            $meta = is_array($stockExposure['meta'] ?? null) ? $stockExposure['meta'] : [];
            $stockCount = (int) ($stockExposure['count'] ?? 0);
            $insights[] = $this->aiInsight([
                'id' => 'stock-rebalance',
                'priority' => 5,
                'title' => 'Rebalance low stock before creating new demand',
                'area' => 'Inventory',
                'summary' => 'Low, reorder-level, or negative balances should be reviewed against transfer and purchase options.',
                'tone' => ((int) ($meta['negative'] ?? 0)) > 0 ? 'danger' : 'info',
                'icon' => 'stock',
                'confidence' => min(94, 76 + $stockCount),
                'impactScore' => 7.2,
                'riskScore' => min(90, 58 + ($stockCount * 3)),
                'financialImpact' => 0,
                'affectedRecords' => $this->plural($stockCount, 'stock balance', 'stock balances'),
                'expectedOutcome' => 'Reduces stockout pressure',
                'recommendedAction' => 'Check transfers before PO creation',
                'approval' => 'Stores manager',
                'sequence' => 'Before new purchase requests',
                'reasoning' => 'Stock exceptions are operationally urgent but may be resolved faster through internal transfer than supplier lead time.',
                'evidence' => [
                    $this->plural((int) ($meta['negative'] ?? 0), 'negative balance', 'negative balances'),
                    $this->plural((int) ($meta['outOfStock'] ?? 0), 'out-of-stock line', 'out-of-stock lines'),
                    $this->plural((int) ($meta['atReorderLevel'] ?? 0), 'line at reorder', 'lines at reorder'),
                ],
            ]);
        }

        if ((int) ($glClose['open'] ?? 0) > 0 || (int) ($glClose['risk'] ?? 0) > 0) {
            $open = (int) ($glClose['open'] ?? 0);
            $risk = (int) ($glClose['risk'] ?? 0);
            $insights[] = $this->aiInsight([
                'id' => 'close-readiness',
                'priority' => 6,
                'title' => 'Clear close exceptions before management review',
                'area' => 'GL close',
                'summary' => 'Close readiness is below target while reconciliation or balancing work remains open.',
                'tone' => $risk > 0 ? 'danger' : 'info',
                'icon' => 'close',
                'confidence' => min(95, 80 + $open + ($risk * 2)),
                'impactScore' => $risk > 0 ? 8.5 : 6.8,
                'riskScore' => min(95, 60 + ($open * 4) + ($risk * 8)),
                'financialImpact' => 0,
                'affectedRecords' => $this->plural($open, 'close item', 'close items'),
                'expectedOutcome' => 'Improves reporting readiness',
                'recommendedAction' => 'Clear reconciliation exceptions',
                'approval' => 'Controller',
                'sequence' => 'Before period close pack',
                'reasoning' => 'Unresolved reconciliation or balancing exceptions weaken management reporting confidence and should be cleared before sign-off.',
                'evidence' => [
                    $this->plural($open, 'open close control', 'open close controls'),
                    $this->plural($risk, 'unbalanced entry', 'unbalanced entries'),
                ],
            ]);
        }

        if (count($insights) === 0) {
            $insights[] = $this->aiInsight([
                'id' => 'all-clear',
                'priority' => 1,
                'title' => 'No critical AI actions queued',
                'area' => 'Operations',
                'summary' => 'The current dashboard signals do not show cash, approval, stock, supplier, or close exceptions requiring escalation.',
                'tone' => 'success',
                'icon' => 'clear',
                'confidence' => 91,
                'impactScore' => 4.0,
                'riskScore' => 12,
                'financialImpact' => 0,
                'affectedRecords' => 'No critical exceptions',
                'expectedOutcome' => 'Maintain daily monitoring',
                'recommendedAction' => 'Continue standard review',
                'approval' => 'Operations owner',
                'sequence' => 'Next scheduled dashboard refresh',
                'reasoning' => 'All major dashboard queues are clear or below escalation thresholds.',
                'evidence' => ['No active escalation trigger'],
            ]);
        }

        return collect($insights)
            ->sort(function (array $left, array $right) {
                if ($left['priority'] !== $right['priority']) {
                    return $left['priority'] <=> $right['priority'];
                }

                if ($left['riskScore'] !== $right['riskScore']) {
                    return $right['riskScore'] <=> $left['riskScore'];
                }

                return $right['impactScore'] <=> $left['impactScore'];
            })
            ->values()
            ->take(5)
            ->map(function (array $insight, int $index) {
                $insight['priority'] = $index + 1;

                return $insight;
            })
            ->all();
    }

    private function aiInsight(array $data): array
    {
        $evidence = collect($data['evidence'] ?? [])
            ->map(static fn ($item) => trim((string) $item))
            ->filter(static fn ($item) => $item !== '')
            ->values()
            ->all();

        return [
            'id' => (string) ($data['id'] ?? 'insight'),
            'priority' => (int) ($data['priority'] ?? 99),
            'title' => (string) ($data['title'] ?? 'Review dashboard signal'),
            'area' => (string) ($data['area'] ?? 'Operations'),
            'summary' => (string) ($data['summary'] ?? ''),
            'tone' => $this->validTone((string) ($data['tone'] ?? 'neutral')),
            'icon' => (string) ($data['icon'] ?? 'clear'),
            'confidence' => max(0, min(99, (int) round((float) ($data['confidence'] ?? 0)))),
            'impactScore' => round(max(0, min(10, (float) ($data['impactScore'] ?? 0))), 1),
            'riskScore' => max(0, min(100, (int) round((float) ($data['riskScore'] ?? 0)))),
            'financialImpact' => round((float) ($data['financialImpact'] ?? 0), 2),
            'affectedRecords' => (string) ($data['affectedRecords'] ?? ''),
            'expectedOutcome' => (string) ($data['expectedOutcome'] ?? ''),
            'recommendedAction' => (string) ($data['recommendedAction'] ?? 'Review'),
            'approval' => (string) ($data['approval'] ?? 'Owner review'),
            'sequence' => (string) ($data['sequence'] ?? ''),
            'reasoning' => (string) ($data['reasoning'] ?? ''),
            'evidence' => $evidence,
        ];
    }

    private function validTone(string $tone): string
    {
        return in_array($tone, ['danger', 'warning', 'pending', 'success', 'info', 'neutral'], true) ? $tone : 'neutral';
    }

    private function metricMoney(float $value): string
    {
        return number_format($value, 0);
    }

    private function supplierExposure(): array
    {
        $rows = collect($this->legacySupplierExposureRows())
            ->groupBy('key')
            ->map(function ($items) {
                $first = $items->first();

                return [
                    'supplier' => (string) ($first['supplier'] ?? 'Unassigned supplier'),
                    'value' => (float) $items->sum('value'),
                    'orders' => (int) $items->sum('orders'),
                    'overdueOrders' => (int) $items->sum('overdueOrders'),
                    'approvalAging' => (int) $items->sum('approvalAging'),
                ];
            })
            ->filter(static fn ($row) => (float) $row['value'] > 0)
            ->sortByDesc('value')
            ->values();

        $totalExposure = round((float) $rows->sum('value'), 2);
        $exposureLimit = $totalExposure > 0 ? round($totalExposure * 0.25, 2) : 0.0;

        return [
            'totalExposure' => $totalExposure,
            'exposureLimit' => $exposureLimit,
            'rows' => $rows
                ->take(5)
                ->values()
                ->map(function ($row, int $index) use ($totalExposure) {
                    $value = round((float) $row['value'], 2);
                    $share = $totalExposure > 0 ? round(($value / $totalExposure) * 100, 1) : 0.0;
                    $overdueOrders = (int) $row['overdueOrders'];
                    $approvalAging = (int) $row['approvalAging'];

                    return [
                        'supplier' => (string) $row['supplier'],
                        'value' => $value,
                        'orders' => (int) $row['orders'],
                        'overdueOrders' => $overdueOrders,
                        'approvalAging' => $approvalAging,
                        'share' => $share,
                        'shareLabel' => $this->percentageLabel($share),
                        'sla' => $this->supplierExposureSignal($overdueOrders, $approvalAging),
                        'color' => $this->supplierExposureColor($index, $share, $overdueOrders, $approvalAging),
                    ];
                })
                ->all(),
        ];
    }

    private function legacySupplierExposureRows(): array
    {
        if (
            !Schema::hasTable('purchorders')
            || !Schema::hasTable('purchorderdetails')
            || !Schema::hasColumn('purchorders', 'orderno')
            || !Schema::hasColumn('purchorders', 'status')
            || !Schema::hasColumn('purchorderdetails', 'orderno')
            || !Schema::hasColumn('purchorderdetails', 'quantityord')
            || !Schema::hasColumn('purchorderdetails', 'unitprice')
        ) {
            return [];
        }

        $hasQuantityReceived = Schema::hasColumn('purchorderdetails', 'quantityrecd');
        $hasSupplierNo = Schema::hasColumn('purchorders', 'supplierno');
        $hasSupplierJoin = $hasSupplierNo
            && Schema::hasTable('suppliers')
            && Schema::hasColumn('suppliers', 'supplierid')
            && Schema::hasColumn('suppliers', 'suppname');
        $hasOrderDate = Schema::hasColumn('purchorders', 'orddate');
        $deliveryDateExpression = $this->purchaseOrderDeliveryDateExpression();
        $remainingQuantity = $hasQuantityReceived
            ? '(COALESCE(pod.quantityord, 0) - COALESCE(pod.quantityrecd, 0))'
            : 'COALESCE(pod.quantityord, 0)';
        $remainingValue = 'CASE WHEN ' . $remainingQuantity . ' > 0 THEN ' . $remainingQuantity . ' * COALESCE(pod.unitprice, 0) ELSE 0 END';
        $excludedStatuses = ['Cancelled', 'Canceled', 'Rejected', 'Completed'];

        $query = DB::table('purchorders as po')
            ->join('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
            ->whereNotIn('po.status', $excludedStatuses)
            ->whereRaw($remainingQuantity . ' > 0');

        if ($hasSupplierJoin) {
            $query->leftJoin('suppliers as s', 's.supplierid', '=', 'po.supplierno');
            $query->select('po.supplierno as supplier_no', 's.suppname as supplier_name');
            $query->groupBy('po.supplierno', 's.suppname');
        } elseif ($hasSupplierNo) {
            $query->select('po.supplierno as supplier_no')
                ->selectRaw('NULL as supplier_name')
                ->groupBy('po.supplierno');
        } else {
            $query->selectRaw('NULL as supplier_no, NULL as supplier_name');
        }

        $query
            ->selectRaw('COUNT(DISTINCT po.orderno) as orders')
            ->selectRaw('COALESCE(SUM(' . $remainingValue . '), 0) as value')
            ->selectRaw("COUNT(DISTINCT CASE WHEN po.status IN ('Pending', 'Reviewed') THEN po.orderno END) as approval_aging");

        if ($deliveryDateExpression !== null) {
            $query->selectRaw(
                'COUNT(DISTINCT CASE WHEN ' . $deliveryDateExpression . ' < ? THEN po.orderno END) as overdue_orders',
                [Carbon::today()->toDateString()],
            );
        } elseif ($hasOrderDate) {
            $query->selectRaw('COUNT(DISTINCT CASE WHEN po.orddate < ? THEN po.orderno END) as overdue_orders', [Carbon::today()->subDays(14)->toDateString()]);
        } else {
            $query->selectRaw('0 as overdue_orders');
        }

        return $query
            ->get()
            ->map(function ($row) {
                $supplier = trim((string) ($row->supplier_name ?? ''));
                $supplierNo = trim((string) ($row->supplier_no ?? ''));

                if ($supplier === '') {
                    $supplier = $supplierNo !== '' ? $supplierNo : 'Unassigned supplier';
                }

                return [
                    'key' => $this->supplierExposureKey($supplier, $supplierNo),
                    'supplier' => $supplier,
                    'value' => (float) ($row->value ?? 0),
                    'orders' => (int) ($row->orders ?? 0),
                    'overdueOrders' => (int) ($row->overdue_orders ?? 0),
                    'approvalAging' => (int) ($row->approval_aging ?? 0),
                ];
            })
            ->all();
    }

    private function purchaseOrderDeliveryDateExpression(): ?string
    {
        if (Schema::hasColumn('purchorderdetails', 'deliverydate')) {
            return 'pod.deliverydate';
        }

        if (Schema::hasColumn('purchorders', 'deliverydate')) {
            return 'po.deliverydate';
        }

        return null;
    }

    private function supplierExposureSignal(int $overdueOrders, int $approvalAging): string
    {
        $signals = [];

        if ($overdueOrders > 0) {
            $signals[] = $this->plural($overdueOrders, 'overdue PO', 'overdue POs');
        }

        if ($approvalAging > 0) {
            $signals[] = $approvalAging . ' approval aging';
        }

        return count($signals) > 0 ? implode(', ', $signals) : 'On target';
    }

    private function supplierExposureColor(int $index, float $share, int $overdueOrders, int $approvalAging): string
    {
        if ($overdueOrders > 0 || $share >= 35) {
            return 'var(--akiva-chart-danger)';
        }

        if ($approvalAging > 0 || $share >= 25) {
            return 'var(--akiva-chart-warning)';
        }

        return [
            'var(--akiva-chart-pending)',
            'var(--akiva-chart-ink)',
            'var(--akiva-chart-success)',
            'var(--akiva-chart-brand)',
            'var(--akiva-chart-warning)',
        ][$index % 5];
    }

    private function supplierExposureKey(string $supplier, string $supplierId): string
    {
        $value = trim($supplier) !== '' ? $supplier : $supplierId;
        $normalized = strtolower(preg_replace('/\s+/', ' ', trim($value)) ?: 'unassigned supplier');

        return $normalized;
    }

    private function percentageLabel(float $value): string
    {
        $decimals = abs($value - round($value)) > 0.05 ? 1 : 0;

        return number_format($value, $decimals) . '%';
    }

    private function modulePulse(): array
    {
        $sales = $this->salesPulseStats();
        $inventory = $this->inventoryPulseStats();
        $payables = $this->payablesPulseStats();
        $glClose = $this->glClosePulseStats();

        return [
            $this->modulePulseRow('sales', 'Sales', 'Revenue desk', 'money', $sales),
            $this->modulePulseRow('inventory', 'Inventory', 'Stores', 'money', $inventory),
            $this->modulePulseRow('payables', 'Payables', 'Finance AP', 'money', $payables),
            $this->modulePulseRow('glClose', 'GL close', 'Controller', 'percent', $glClose),
        ];
    }

    private function modulePulseRow(string $id, string $module, string $owner, string $postedType, array $stats): array
    {
        return [
            'id' => $id,
            'module' => $module,
            'owner' => $owner,
            'postedType' => $postedType,
            'postedValue' => round((float) ($stats['postedValue'] ?? 0), 2),
            'open' => (int) ($stats['open'] ?? 0),
            'risk' => (int) ($stats['risk'] ?? 0),
            'tone' => (string) ($stats['tone'] ?? 'neutral'),
        ];
    }

    private function salesPulseStats(): array
    {
        $openReceivables = $this->openReceivablesSummary();
        $overdueReceivables = $this->legacyOverdueReceivables();
        $open = (int) $openReceivables['count'] + $this->openSalesOrderCount();
        $risk = (int) $overdueReceivables['count'];

        return [
            'postedValue' => $this->postedSalesValueThisMonth(),
            'open' => $open,
            'risk' => $risk,
            'tone' => $this->salesPulseTone($risk, $open),
        ];
    }

    private function inventoryPulseStats(): array
    {
        $stockExposure = $this->stockExposureSummary();
        $risk = (int) $stockExposure['total'];

        return [
            'postedValue' => $this->inventoryValue(),
            'open' => $this->activeInventoryLineCount(),
            'risk' => $risk,
            'tone' => $risk > 0 ? 'warning' : 'success',
        ];
    }

    private function payablesPulseStats(): array
    {
        $payables = $this->openPayablesSummary();
        $paymentRun = $this->paymentRunStats();
        $risk = (int) $paymentRun['count'];

        return [
            'postedValue' => (float) $payables['amount'],
            'open' => (int) $payables['count'],
            'risk' => $risk,
            'tone' => $risk > 0 ? 'danger' : 'success',
        ];
    }

    private function glClosePulseStats(): array
    {
        $unmatchedBankTransactions = $this->unmatchedBankTransactionCount();
        $unbalancedEntries = $this->unbalancedGlEntryCount();
        $open = $unmatchedBankTransactions + $unbalancedEntries;
        $postedValue = $open > 0 ? max(0, min(99, 100 - ($open * 5))) : 100;

        return [
            'postedValue' => $postedValue,
            'open' => $open,
            'risk' => $unbalancedEntries,
            'tone' => $unbalancedEntries > 0 ? 'danger' : ($open > 0 ? 'info' : 'success'),
        ];
    }

    private function postedSalesValueThisMonth(): float
    {
        if (!Schema::hasTable('debtortrans')) {
            return 0.0;
        }

        $dateColumn = $this->firstExistingColumn('debtortrans', ['trandate', 'inputdate']);
        if ($dateColumn === null) {
            return 0.0;
        }

        $amountExpression = $this->legacyCustomerGrossAmountExpression('dt');
        $query = DB::table('debtortrans as dt')
            ->whereDate('dt.' . $dateColumn, '>=', Carbon::today()->startOfMonth()->toDateString())
            ->whereDate('dt.' . $dateColumn, '<=', Carbon::today()->toDateString());

        if (Schema::hasColumn('debtortrans', 'type')) {
            $query->where('dt.type', 10);
        }

        return (float) $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount')
            ->value('amount');
    }

    private function openReceivablesSummary(): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacyCustomerAmountExpression('dt');
        $query = DB::table('debtortrans as dt')
            ->whereRaw($amountExpression . ' > 0.004');

        if (Schema::hasColumn('debtortrans', 'type')) {
            $query->where('dt.type', 10);
        }

        if (Schema::hasColumn('debtortrans', 'settled')) {
            $query->where('dt.settled', 0);
        }

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function openSalesOrderCount(): int
    {
        if (!Schema::hasTable('salesorders')) {
            return 0;
        }

        if (
            Schema::hasTable('salesorderdetails')
            && Schema::hasColumn('salesorders', 'orderno')
            && Schema::hasColumn('salesorderdetails', 'orderno')
            && Schema::hasColumn('salesorderdetails', 'quantity')
            && Schema::hasColumn('salesorderdetails', 'qtyinvoiced')
        ) {
            $query = DB::table('salesorders as so')
                ->join('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
                ->whereRaw('(COALESCE(sod.quantity, 0) - COALESCE(sod.qtyinvoiced, 0)) > 0');

            if (Schema::hasColumn('salesorderdetails', 'completed')) {
                $query->where('sod.completed', 0);
            }

            if (Schema::hasColumn('salesorders', 'quotation')) {
                $query->where('so.quotation', 0);
            }

            return (int) $query->distinct('so.orderno')->count('so.orderno');
        }

        $query = DB::table('salesorders');
        if (Schema::hasColumn('salesorders', 'quotation')) {
            $query->where('quotation', 0);
        }

        return (int) $query->count();
    }

    private function inventoryValue(): float
    {
        if (
            !Schema::hasTable('locstock')
            || !Schema::hasTable('stockmaster')
            || !Schema::hasColumn('locstock', 'quantity')
            || !Schema::hasColumn('locstock', 'stockid')
            || !Schema::hasColumn('stockmaster', 'stockid')
        ) {
            return 0.0;
        }

        $unitCostExpression = $this->stockUnitCostExpression('sm');
        if ($unitCostExpression === '0') {
            return 0.0;
        }

        return (float) $this->stockBaseQuery()
            ->selectRaw('COALESCE(SUM(CASE WHEN COALESCE(ls.quantity, 0) > 0 THEN COALESCE(ls.quantity, 0) * (' . $unitCostExpression . ') ELSE 0 END), 0) as value')
            ->value('value');
    }

    private function activeInventoryLineCount(): int
    {
        if (
            !Schema::hasTable('locstock')
            || !Schema::hasTable('stockmaster')
            || !Schema::hasColumn('locstock', 'quantity')
            || !Schema::hasColumn('locstock', 'stockid')
            || !Schema::hasColumn('stockmaster', 'stockid')
        ) {
            return 0;
        }

        return (int) $this->stockBaseQuery()
            ->where('ls.quantity', '<>', 0)
            ->count();
    }

    private function openPayablesSummary(): array
    {
        $native = $this->nativeOpenPayables();
        $legacy = $this->legacyOpenPayables();

        return [
            'amount' => (float) $native['amount'] + (float) $legacy['amount'],
            'count' => (int) $native['count'] + (int) $legacy['count'],
        ];
    }

    private function nativeOpenPayables(): array
    {
        if (!Schema::hasTable('ap_bills') || !Schema::hasColumn('ap_bills', 'amount_due')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $query = DB::table('ap_bills as b')
            ->where('b.amount_due', '>', 0);

        $this->withoutDeleted($query, 'ap_bills', 'b');

        $row = $query
            ->selectRaw('COALESCE(SUM(b.amount_due), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function legacyOpenPayables(): array
    {
        if (!Schema::hasTable('supptrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacySupplierAmountExpression('st');
        $query = DB::table('supptrans as st')
            ->whereRaw($amountExpression . ' > 0');

        if (Schema::hasColumn('supptrans', 'hold')) {
            $query->where('st.hold', 0);
        }

        if (Schema::hasColumn('supptrans', 'void')) {
            $query->where('st.void', 0);
        }

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function unmatchedBankTransactionCount(): int
    {
        if (!Schema::hasTable('banktrans')) {
            return 0;
        }

        if (Schema::hasColumn('banktrans', 'amountcleared')) {
            return (int) DB::table('banktrans')
                ->whereRaw('ABS(COALESCE(amountcleared, 0)) <= 0.000001')
                ->count();
        }

        if (Schema::hasColumn('banktrans', 'reconciled')) {
            return (int) DB::table('banktrans')
                ->where('reconciled', 0)
                ->count();
        }

        return 0;
    }

    private function unbalancedGlEntryCount(): int
    {
        if (!Schema::hasTable('gltrans') || !Schema::hasColumn('gltrans', 'amount')) {
            return 0;
        }

        $groupColumns = array_values(array_filter(
            ['type', 'typeno', 'transno'],
            static fn ($column) => Schema::hasColumn('gltrans', $column)
        ));

        if (count($groupColumns) === 0) {
            return abs((float) DB::table('gltrans')->sum('amount')) > 0.01 ? 1 : 0;
        }

        $query = DB::table('gltrans')
            ->selectRaw('SUM(amount) as balance');

        foreach ($groupColumns as $column) {
            $query->addSelect($column)->groupBy($column);
        }

        return (int) DB::query()
            ->fromSub($query, 'gl_batches')
            ->whereRaw('ABS(COALESCE(balance, 0)) > 0.01')
            ->count();
    }

    private function salesPulseTone(int $risk, int $open): string
    {
        if ($risk <= 0) {
            return 'success';
        }

        $ratio = $open > 0 ? $risk / $open : 1;

        if ($ratio >= 0.2 || $risk >= 20) {
            return 'danger';
        }

        if ($ratio >= 0.1 || $risk >= 5) {
            return 'warning';
        }

        return 'success';
    }

    private function workflowBottlenecks(): array
    {
        $poApproval = $this->pendingPurchaseOrderApprovalStats();
        $grnPosting = $this->grnPostingStats();
        $invoiceMatch = $this->invoiceMatchStats();
        $paymentRun = $this->paymentRunStats();

        return [
            $this->workflowStage('poApproval', 'PO approval', $poApproval, 12, 'pending'),
            $this->workflowStage('grnPosting', 'GRN posting', $grnPosting, 8, 'info'),
            $this->workflowStage('invoiceMatch', 'Invoice match', $invoiceMatch, 10, 'pending'),
            $this->workflowStage('paymentRun', 'Payment run', $paymentRun, 6, 'danger'),
        ];
    }

    private function workflowStage(string $id, string $label, array $stats, int $target, string $tone): array
    {
        return [
            'id' => $id,
            'label' => $label,
            'count' => (int) ($stats['count'] ?? 0),
            'value' => round((float) ($stats['value'] ?? 0), 2),
            'target' => $target,
            'tone' => $tone,
        ];
    }

    private function cashFlowForecast(): array
    {
        $today = Carbon::today();
        $forecastStart = $today->copy()->startOfMonth();
        $firstMonth = $today->copy()->subMonthsNoOverflow(7)->startOfMonth();
        $currentCash = round($this->currentCashBalance(), 2);
        $runningForecast = $currentCash;
        $forecastReceivables = 0.0;
        $forecastPayables = 0.0;
        $rows = [];

        for ($index = 0; $index < 11; $index++) {
            $periodStart = $firstMonth->copy()->addMonthsNoOverflow($index)->startOfMonth();
            $periodEnd = $periodStart->copy()->endOfMonth();
            $isForecastMonth = $periodStart->greaterThanOrEqualTo($forecastStart);
            $receivables = round($this->receivablesDueBetween($periodStart, $periodEnd), 2);
            $payables = round($this->payablesDueBetween($periodStart, $periodEnd), 2);
            $cash = null;
            $forecastCash = null;

            if ($periodStart->lessThan($forecastStart)) {
                $cash = $this->cashBalanceThrough($periodEnd);
                $cash = $cash === null ? null : round($cash, 2);
            } elseif ($periodStart->isSameMonth($forecastStart)) {
                $cash = $currentCash;
                $forecastCash = $currentCash;
                $runningForecast += $receivables - $payables;
                $forecastReceivables += $receivables;
                $forecastPayables += $payables;
            } else {
                $runningForecast += $receivables - $payables;
                $forecastCash = round($runningForecast, 2);
                $forecastReceivables += $receivables;
                $forecastPayables += $payables;
            }

            $rows[] = [
                'month' => $periodStart->format('Y-m'),
                'label' => $periodStart->format('M y'),
                'cash' => $cash,
                'receivables' => $receivables,
                'payables' => $payables,
                'forecastCash' => $forecastCash,
                'isForecast' => $isForecastMonth,
            ];
        }

        $forecastValues = collect($rows)
            ->pluck('forecastCash')
            ->filter(static fn ($value) => $value !== null)
            ->map(static fn ($value) => (float) $value);
        $closingForecast = $forecastValues->isNotEmpty() ? (float) $forecastValues->last() : $currentCash;

        return [
            'currency' => $this->currency(),
            'generatedAt' => now()->toIso8601String(),
            'forecastStartMonth' => $forecastStart->format('Y-m'),
            'minimumReserve' => round($this->payablesDueBetween($today, $today->copy()->addDays(30)), 2),
            'rows' => $rows,
            'summary' => [
                'openingCash' => $currentCash,
                'closingForecast' => round($closingForecast, 2),
                'projectedReceivables' => round($forecastReceivables, 2),
                'projectedPayables' => round($forecastPayables, 2),
                'netProjectedFlow' => round($closingForecast - $currentCash, 2),
                'lowestProjectedCash' => $forecastValues->isNotEmpty() ? round((float) $forecastValues->min(), 2) : $currentCash,
            ],
        ];
    }

    private function overdueReceivablesCard(): array
    {
        $summary = $this->legacyOverdueReceivables();
        $amount = round($summary['amount'], 2);
        $count = $summary['count'];

        return [
            'value' => $amount,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'invoice', 'invoices') . ' beyond credit terms'
                : 'No invoices beyond credit terms',
            'status' => $count > 0 ? 'Collect' : 'Clear',
            'tone' => $count > 0 ? 'warning' : 'success',
        ];
    }

    private function approvalBacklogCard(): array
    {
        $supplierBills = $this->pendingSupplierBillApprovals();
        $purchaseOrders = $this->pendingPurchaseOrderApprovals();
        $count = $supplierBills + $purchaseOrders;

        return [
            'value' => $count,
            'count' => $count,
            'detail' => $count > 0
                ? $purchaseOrders . ' POs and ' . $supplierBills . ' supplier bills awaiting decision'
                : 'No purchasing approvals awaiting decision',
            'status' => $count > 0 ? 'Aging' : 'Clear',
            'tone' => $count > 0 ? 'pending' : 'success',
            'meta' => [
                'purchaseOrders' => $purchaseOrders,
                'supplierBills' => $supplierBills,
            ],
        ];
    }

    private function stockExposureCard(): array
    {
        $summary = $this->stockExposureSummary();
        $count = $summary['total'];

        return [
            'value' => $count,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'low or negative balance', 'low or negative balances') . ' affecting sales'
                : 'No low or negative stock balances',
            'status' => $count > 0 ? 'Review' : 'Clear',
            'tone' => $count > 0 ? 'info' : 'success',
            'meta' => $summary,
        ];
    }

    private function nativePayablesDueWithin(int $days): array
    {
        if (!Schema::hasTable('ap_bills')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $query = DB::table('ap_bills as b')
            ->where('b.amount_due', '>', 0)
            ->whereDate('b.due_date', '<=', now()->addDays($days)->toDateString());

        $this->withoutDeleted($query, 'ap_bills', 'b');

        $row = $query
            ->selectRaw('COALESCE(SUM(b.amount_due), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function payablesDueBetween(Carbon $from, Carbon $to): float
    {
        return $this->nativePayablesDueBetweenDates($from, $to)
            + $this->legacyPayablesDueBetween($from, $to);
    }

    private function nativePayablesDueBetweenDates(Carbon $from, Carbon $to): float
    {
        if (!Schema::hasTable('ap_bills')) {
            return 0.0;
        }

        $query = DB::table('ap_bills as b')
            ->where('b.amount_due', '>', 0)
            ->whereDate('b.due_date', '>=', $from->toDateString())
            ->whereDate('b.due_date', '<=', $to->toDateString());

        $this->withoutDeleted($query, 'ap_bills', 'b');

        return (float) $query->sum('b.amount_due');
    }

    private function legacyPayablesDueBetween(Carbon $from, Carbon $to): float
    {
        if (!Schema::hasTable('supptrans')) {
            return 0.0;
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return 0.0;
        }

        $amountExpression = $this->legacySupplierAmountExpression('st');
        $query = DB::table('supptrans as st')
            ->whereRaw($amountExpression . ' > 0')
            ->whereDate('st.' . $dueDateColumn, '>=', $from->toDateString())
            ->whereDate('st.' . $dueDateColumn, '<=', $to->toDateString());

        if (Schema::hasColumn('supptrans', 'hold')) {
            $query->where('st.hold', 0);
        }

        if (Schema::hasColumn('supptrans', 'void')) {
            $query->where('st.void', 0);
        }

        return (float) $query->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount')->value('amount');
    }

    private function legacyPayablesDueWithin(int $days): array
    {
        if (!Schema::hasTable('supptrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacySupplierAmountExpression('st');
        $query = DB::table('supptrans as st')
            ->whereRaw($amountExpression . ' > 0')
            ->whereDate('st.' . $dueDateColumn, '<=', now()->addDays($days)->toDateString());

        if (Schema::hasColumn('supptrans', 'hold')) {
            $query->where('st.hold', 0);
        }

        if (Schema::hasColumn('supptrans', 'void')) {
            $query->where('st.void', 0);
        }

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function receivablesDueBetween(Carbon $from, Carbon $to): float
    {
        if (!Schema::hasTable('debtortrans')) {
            return 0.0;
        }

        $dateColumn = $this->firstExistingColumn('debtortrans', ['trandate', 'inputdate']);
        if ($dateColumn === null) {
            return 0.0;
        }

        $amountExpression = $this->legacyCustomerAmountExpression('dt');
        $query = DB::table('debtortrans as dt');
        $usesPaymentTerms = false;

        if (Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'debtorno')) {
            $query->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno');

            if (
                Schema::hasTable('paymentterms')
                && Schema::hasColumn('debtorsmaster', 'paymentterms')
                && Schema::hasColumn('paymentterms', 'termsindicator')
            ) {
                $query->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms');
                $usesPaymentTerms = true;
            }
        }

        if (Schema::hasColumn('debtortrans', 'type')) {
            $query->where('dt.type', 10);
        }

        if (Schema::hasColumn('debtortrans', 'settled')) {
            $query->where('dt.settled', 0);
        }

        $dueDateExpression = $this->receivableDueDateExpression('dt.' . $dateColumn, $usesPaymentTerms);

        return (float) $query
            ->whereRaw($amountExpression . ' > 0.004')
            ->whereRaw($dueDateExpression . ' >= ?', [$from->toDateString()])
            ->whereRaw($dueDateExpression . ' <= ?', [$to->toDateString()])
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount')
            ->value('amount');
    }

    private function legacyOverdueReceivables(): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $dateColumn = $this->firstExistingColumn('debtortrans', ['trandate', 'inputdate']);
        if ($dateColumn === null) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacyCustomerAmountExpression('dt');
        $query = DB::table('debtortrans as dt');
        $usesPaymentTerms = false;

        if (Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'debtorno')) {
            $query->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno');

            if (
                Schema::hasTable('paymentterms')
                && Schema::hasColumn('debtorsmaster', 'paymentterms')
                && Schema::hasColumn('paymentterms', 'termsindicator')
            ) {
                $query->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms');
                $usesPaymentTerms = true;
            }
        }

        if (Schema::hasColumn('debtortrans', 'type')) {
            $query->where('dt.type', 10);
        }

        if (Schema::hasColumn('debtortrans', 'settled')) {
            $query->where('dt.settled', 0);
        }

        $query
            ->whereRaw($amountExpression . ' > 0.004')
            ->whereRaw($this->receivableDueDateExpression('dt.' . $dateColumn, $usesPaymentTerms) . ' < ?', [Carbon::today()->toDateString()]);

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function pendingSupplierBillApprovals(): int
    {
        if (!Schema::hasTable('ap_bill_approval_instances')) {
            return 0;
        }

        $query = DB::table('ap_bill_approval_instances as i')
            ->where('i.status', 'pending');

        $this->withoutDeleted($query, 'ap_bill_approval_instances', 'i');

        return (int) $query->count();
    }

    private function pendingPurchaseOrderApprovals(): int
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasColumn('purchorders', 'status')) {
            return 0;
        }

        return (int) DB::table('purchorders')
            ->whereIn('status', ['Pending', 'Reviewed'])
            ->count();
    }

    private function pendingPurchaseOrderApprovalStats(): array
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasColumn('purchorders', 'orderno') || !Schema::hasColumn('purchorders', 'status')) {
            return ['count' => 0, 'value' => 0.0];
        }

        if (
            !Schema::hasTable('purchorderdetails')
            || !Schema::hasColumn('purchorderdetails', 'orderno')
            || !Schema::hasColumn('purchorderdetails', 'quantityord')
            || !Schema::hasColumn('purchorderdetails', 'unitprice')
        ) {
            return [
                'count' => (int) DB::table('purchorders')->whereIn('status', ['Pending', 'Reviewed'])->count(),
                'value' => 0.0,
            ];
        }

        $row = DB::table('purchorders as po')
            ->leftJoin('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
            ->whereIn('po.status', ['Pending', 'Reviewed'])
            ->selectRaw('COUNT(DISTINCT po.orderno) as count')
            ->selectRaw('COALESCE(SUM(COALESCE(pod.quantityord, 0) * COALESCE(pod.unitprice, 0)), 0) as value')
            ->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'value' => (float) ($row->value ?? 0),
        ];
    }

    private function grnPostingStats(): array
    {
        if (
            !Schema::hasTable('purchorders')
            || !Schema::hasTable('purchorderdetails')
            || !Schema::hasColumn('purchorders', 'orderno')
            || !Schema::hasColumn('purchorders', 'status')
            || !Schema::hasColumn('purchorderdetails', 'orderno')
            || !Schema::hasColumn('purchorderdetails', 'quantityord')
            || !Schema::hasColumn('purchorderdetails', 'quantityrecd')
            || !Schema::hasColumn('purchorderdetails', 'unitprice')
        ) {
            return ['count' => 0, 'value' => 0.0];
        }

        $openStatusesToExclude = ['Cancelled', 'Canceled', 'Rejected', 'Completed', 'Pending', 'Modify', 'Reviewed'];
        $remainingQuantity = '(COALESCE(pod.quantityord, 0) - COALESCE(pod.quantityrecd, 0))';
        $remainingValue = 'CASE WHEN ' . $remainingQuantity . ' > 0 THEN ' . $remainingQuantity . ' * COALESCE(pod.unitprice, 0) ELSE 0 END';

        $row = DB::table('purchorders as po')
            ->join('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
            ->whereNotIn('po.status', $openStatusesToExclude)
            ->whereRaw($remainingQuantity . ' > 0')
            ->selectRaw('COUNT(DISTINCT po.orderno) as count')
            ->selectRaw('COALESCE(SUM(' . $remainingValue . '), 0) as value')
            ->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'value' => (float) ($row->value ?? 0),
        ];
    }

    private function invoiceMatchStats(): array
    {
        if (!Schema::hasTable('ap_bills') || !Schema::hasColumn('ap_bills', 'amount_due')) {
            return ['count' => 0, 'value' => 0.0];
        }

        $query = DB::table('ap_bills as b')
            ->where('b.amount_due', '>', 0);

        $this->withoutDeleted($query, 'ap_bills', 'b');

        if (Schema::hasColumn('ap_bills', 'matching_status')) {
            $query->whereNotIn('b.matching_status', ['matched', 'override_approved']);
        } elseif (Schema::hasTable('ap_bill_matches') && Schema::hasColumn('ap_bill_matches', 'bill_id') && Schema::hasColumn('ap_bill_matches', 'status')) {
            $query->whereNotExists(function ($subQuery) {
                $subQuery
                    ->selectRaw('1')
                    ->from('ap_bill_matches as m')
                    ->whereColumn('m.bill_id', 'b.id')
                    ->where('m.status', 'matched');

                $this->withoutDeleted($subQuery, 'ap_bill_matches', 'm');
            });
        }

        $row = $query
            ->selectRaw('COUNT(*) as count')
            ->selectRaw('COALESCE(SUM(b.amount_due), 0) as value')
            ->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'value' => (float) ($row->value ?? 0),
        ];
    }

    private function paymentRunStats(): array
    {
        $horizonDays = 14;
        $native = $this->nativePayablesDueWithin($horizonDays);
        $legacy = $this->legacyPayablesDueWithin($horizonDays);

        return [
            'count' => (int) $native['count'] + (int) $legacy['count'],
            'value' => (float) $native['amount'] + (float) $legacy['amount'],
        ];
    }

    private function stockExposureSummary(): array
    {
        if (
            !Schema::hasTable('locstock')
            || !Schema::hasTable('stockmaster')
            || !Schema::hasColumn('locstock', 'quantity')
            || !Schema::hasColumn('locstock', 'stockid')
            || !Schema::hasColumn('stockmaster', 'stockid')
        ) {
            return ['total' => 0, 'negative' => 0, 'outOfStock' => 0, 'atReorderLevel' => 0];
        }

        $negative = (int) $this->stockBaseQuery()
            ->where('ls.quantity', '<', 0)
            ->count();

        $outOfStock = 0;
        $atReorderLevel = 0;

        if (Schema::hasColumn('locstock', 'reorderlevel')) {
            $outOfStock = (int) $this->stockBaseQuery()
                ->where('ls.quantity', '=', 0)
                ->where('ls.reorderlevel', '>', 0)
                ->count();

            $atReorderLevel = (int) $this->stockBaseQuery()
                ->where('ls.quantity', '>', 0)
                ->where('ls.reorderlevel', '>', 0)
                ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel')
                ->count();
        }

        return [
            'total' => $negative + $outOfStock + $atReorderLevel,
            'negative' => $negative,
            'outOfStock' => $outOfStock,
            'atReorderLevel' => $atReorderLevel,
        ];
    }

    private function stockBaseQuery()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid');

        if (Schema::hasColumn('stockmaster', 'mbflag')) {
            $query->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        }

        return $query;
    }

    private function stockUnitCostExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $standardCostColumns = array_values(array_filter(
            ['materialcost', 'labourcost', 'overheadcost'],
            static fn ($column) => Schema::hasColumn('stockmaster', $column)
        ));

        if (count($standardCostColumns) > 0) {
            return '(' . implode(' + ', array_map(static fn ($column) => 'COALESCE(' . $prefix . $column . ', 0)', $standardCostColumns)) . ')';
        }

        foreach (['standardcost', 'actualcost', 'lastcost'] as $column) {
            if (Schema::hasColumn('stockmaster', $column)) {
                return 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        return '0';
    }

    private function currentCashBalance(): float
    {
        $bankAccountBalance = $this->latestBankAccountBalance();
        if ($bankAccountBalance !== null) {
            return $bankAccountBalance;
        }

        $bankTransBalance = $this->cashBalanceThrough(Carbon::today());
        if ($bankTransBalance !== null) {
            return $bankTransBalance;
        }

        return 0.0;
    }

    private function latestBankAccountBalance(): ?float
    {
        if (
            !Schema::hasTable('bankaccounts')
            || !Schema::hasTable('chartdetails')
            || !Schema::hasTable('periods')
            || !Schema::hasColumn('bankaccounts', 'accountcode')
            || !Schema::hasColumn('chartdetails', 'accountcode')
            || !Schema::hasColumn('chartdetails', 'period')
            || !Schema::hasColumn('chartdetails', 'bfwd')
            || !Schema::hasColumn('chartdetails', 'actual')
        ) {
            return null;
        }

        $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);
        if ($latestPeriod <= 0) {
            return null;
        }

        return (float) DB::table('bankaccounts as ba')
            ->leftJoin('chartdetails as cd', function ($join) use ($latestPeriod) {
                $join
                    ->on('cd.accountcode', '=', 'ba.accountcode')
                    ->where('cd.period', '=', $latestPeriod);
            })
            ->selectRaw('COALESCE(SUM(COALESCE(cd.bfwd, 0) + COALESCE(cd.actual, 0)), 0) as balance')
            ->value('balance');
    }

    private function cashBalanceThrough(Carbon $date): ?float
    {
        if (
            !Schema::hasTable('banktrans')
            || !Schema::hasColumn('banktrans', 'amount')
            || !Schema::hasColumn('banktrans', 'transdate')
        ) {
            return null;
        }

        return (float) DB::table('banktrans')
            ->whereDate('transdate', '<=', $date->toDateString())
            ->sum('amount');
    }

    private function legacySupplierAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight'] as $column) {
            if (Schema::hasColumn('supptrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        if (Schema::hasColumn('supptrans', 'ovdiscount')) {
            $parts[] = '- COALESCE(' . $prefix . 'ovdiscount, 0)';
        }

        $gross = count($parts) > 0 ? implode(' + ', $parts) : '0';
        if (Schema::hasColumn('supptrans', 'alloc')) {
            return '(' . $gross . ' - COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . $gross . ')';
    }

    private function legacyCustomerGrossAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight'] as $column) {
            if (Schema::hasColumn('debtortrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        if (Schema::hasColumn('debtortrans', 'ovdiscount')) {
            $parts[] = '- COALESCE(' . $prefix . 'ovdiscount, 0)';
        }

        return '(' . (count($parts) > 0 ? implode(' + ', $parts) : '0') . ')';
    }

    private function legacyCustomerAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight', 'ovdiscount'] as $column) {
            if (Schema::hasColumn('debtortrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        $gross = count($parts) > 0 ? implode(' + ', $parts) : '0';
        if (Schema::hasColumn('debtortrans', 'alloc')) {
            return '(' . $gross . ' - COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . $gross . ')';
    }

    private function receivableDueDateExpression(string $transactionDate, bool $usesPaymentTerms): string
    {
        if (
            $usesPaymentTerms
            && Schema::hasTable('paymentterms')
            && Schema::hasColumn('paymentterms', 'daysbeforedue')
            && Schema::hasColumn('paymentterms', 'dayinfollowingmonth')
        ) {
            return '(CASE WHEN COALESCE(pt.daysbeforedue, 0) > 0 '
                . 'THEN DATE_ADD(' . $transactionDate . ', INTERVAL COALESCE(pt.daysbeforedue, 0) DAY) '
                . 'ELSE DATE_ADD(LAST_DAY(' . $transactionDate . '), INTERVAL COALESCE(pt.dayinfollowingmonth, 0) DAY) END)';
        }

        return $transactionDate;
    }

    private function withoutDeleted($query, string $table, string $alias = '')
    {
        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull(($alias !== '' ? $alias : $table) . '.deleted_at');
        }

        return $query;
    }

    private function firstExistingColumn(string $table, array $columns): ?string
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function companyName(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'Akiva ERP';
        }

        return html_entity_decode((string) (DB::table('companies')->where('coycode', 1)->value('coyname') ?: 'Akiva ERP'));
    }

    private function plural(int $count, string $singular, string $plural): string
    {
        return $count . ' ' . ($count === 1 ? $singular : $plural);
    }
}
