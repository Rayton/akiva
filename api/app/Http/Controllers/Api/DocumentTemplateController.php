<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DocumentTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class DocumentTemplateController extends Controller
{
    private array $paperSizes = ['A4', 'A5', 'A6', 'Letter', 'Legal', 'Label'];

    private array $orientations = ['portrait', 'landscape'];

    private array $statuses = ['active', 'draft', 'archived'];

    private array $documentTypes = [
        'purchase_order' => 'Purchase order',
        'goods_received_note' => 'Goods received note',
        'picking_list' => 'Picking list',
        'payment_request' => 'Payment request',
        'shipping_label' => 'Shipping label',
        'journal' => 'Journal',
        'custom' => 'Custom',
    ];

    private array $blockTypes = [
        'text' => 'Text',
        'field' => 'Field',
        'table' => 'Table',
        'totals' => 'Totals',
        'image' => 'Image',
        'signature' => 'Signature',
        'divider' => 'Divider',
        'spacer' => 'Spacer',
    ];

    private array $tokens = [
        '{company.name}',
        '{company.address}',
        '{company.phone}',
        '{company.email}',
        '{document.number}',
        '{document.date}',
        '{document.reference}',
        '{customer.name}',
        '{supplier.name}',
        '{delivery.address}',
        '{lines.table}',
        '{totals.subtotal}',
        '{totals.tax}',
        '{totals.grandTotal}',
        '{prepared.by}',
        '{approved.by}',
    ];

    public function index()
    {
        $this->seedDefaults();

        return response()->json([
            'success' => true,
            'data' => [
                'templates' => DocumentTemplate::query()
                    ->orderByRaw("FIELD(status, 'active', 'draft', 'archived')")
                    ->orderBy('name')
                    ->get()
                    ->map(fn (DocumentTemplate $template) => $this->serialize($template))
                    ->values(),
                'lookups' => $this->lookups(),
            ],
        ]);
    }

    public function show(string $template)
    {
        $this->seedDefaults();

        return response()->json([
            'success' => true,
            'data' => [
                'template' => $this->serialize($this->findTemplate($template)),
                'lookups' => $this->lookups(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $values = $this->values($request);
        $values['created_by'] = $this->actor($request);
        $values['updated_by'] = $values['created_by'];

        $template = DocumentTemplate::create($values);

        return response()->json([
            'success' => true,
            'message' => 'Template created.',
            'data' => [
                'template' => $this->serialize($template),
                'lookups' => $this->lookups(),
            ],
        ], 201);
    }

    public function update(Request $request, string $template)
    {
        $record = $this->findTemplate($template);
        $validator = $this->validator($request, $record->id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $values = $this->values($request);
        $values['updated_by'] = $this->actor($request);
        $values['version'] = ((int) $record->version) + 1;
        $record->update($values);

        return response()->json([
            'success' => true,
            'message' => 'Template saved.',
            'data' => [
                'template' => $this->serialize($record->fresh()),
                'lookups' => $this->lookups(),
            ],
        ]);
    }

    public function duplicate(Request $request, string $template)
    {
        $record = $this->findTemplate($template);
        $copy = $record->replicate();
        $copy->code = $this->uniqueCode($record->code.'-copy');
        $copy->name = $record->name.' Copy';
        $copy->status = 'draft';
        $copy->version = 1;
        $copy->created_by = $this->actor($request);
        $copy->updated_by = $copy->created_by;
        $copy->save();

        return response()->json([
            'success' => true,
            'message' => 'Template duplicated.',
            'data' => [
                'template' => $this->serialize($copy),
                'lookups' => $this->lookups(),
            ],
        ], 201);
    }

    public function destroy(string $template)
    {
        $record = $this->findTemplate($template);
        $record->delete();

        return response()->json([
            'success' => true,
            'message' => 'Template archived.',
            'data' => [
                'templates' => DocumentTemplate::query()
                    ->orderBy('name')
                    ->get()
                    ->map(fn (DocumentTemplate $template) => $this->serialize($template))
                    ->values(),
                'lookups' => $this->lookups(),
            ],
        ]);
    }

    private function validator(Request $request, ?int $ignoreId = null)
    {
        return Validator::make($request->all(), [
            'code' => [
                'required',
                'string',
                'max:80',
                'regex:/^[a-z0-9][a-z0-9_-]*$/',
                Rule::unique('document_templates', 'code')->ignore($ignoreId),
            ],
            'name' => ['required', 'string', 'max:160'],
            'documentType' => ['required', 'string', Rule::in(array_keys($this->documentTypes))],
            'description' => ['nullable', 'string', 'max:2000'],
            'paperSize' => ['required', 'string', Rule::in($this->paperSizes)],
            'orientation' => ['required', 'string', Rule::in($this->orientations)],
            'margins.top' => ['required', 'integer', 'min:0', 'max:80'],
            'margins.right' => ['required', 'integer', 'min:0', 'max:80'],
            'margins.bottom' => ['required', 'integer', 'min:0', 'max:80'],
            'margins.left' => ['required', 'integer', 'min:0', 'max:80'],
            'status' => ['required', 'string', Rule::in($this->statuses)],
            'layoutJson' => ['required', 'array'],
            'layoutJson.schemaVersion' => ['required', 'integer', 'min:1'],
            'layoutJson.sections' => ['required', 'array'],
        ], [
            'code.regex' => 'Use lowercase letters, numbers, hyphens, and underscores for the template code.',
        ]);
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function values(Request $request): array
    {
        return [
            'code' => Str::slug((string) $request->input('code'), '-'),
            'name' => trim((string) $request->input('name')),
            'document_type' => (string) $request->input('documentType'),
            'description' => trim((string) $request->input('description', '')),
            'paper_size' => (string) $request->input('paperSize'),
            'orientation' => (string) $request->input('orientation'),
            'margin_top' => (int) $request->input('margins.top'),
            'margin_right' => (int) $request->input('margins.right'),
            'margin_bottom' => (int) $request->input('margins.bottom'),
            'margin_left' => (int) $request->input('margins.left'),
            'layout_json' => $this->normalizeLayout((array) $request->input('layoutJson')),
            'status' => (string) $request->input('status'),
        ];
    }

    private function findTemplate(string $template): DocumentTemplate
    {
        return DocumentTemplate::query()
            ->where('id', ctype_digit($template) ? (int) $template : 0)
            ->orWhere('code', $template)
            ->firstOrFail();
    }

    private function serialize(DocumentTemplate $template): array
    {
        return [
            'id' => $template->id,
            'code' => $template->code,
            'name' => $template->name,
            'documentType' => $template->document_type,
            'description' => $template->description ?? '',
            'paperSize' => $template->paper_size,
            'orientation' => $template->orientation,
            'margins' => [
                'top' => (int) $template->margin_top,
                'right' => (int) $template->margin_right,
                'bottom' => (int) $template->margin_bottom,
                'left' => (int) $template->margin_left,
            ],
            'layoutJson' => $this->normalizeLayout((array) $template->layout_json),
            'status' => $template->status,
            'version' => (int) $template->version,
            'createdBy' => $template->created_by,
            'updatedBy' => $template->updated_by,
            'createdAt' => optional($template->created_at)->toJSON(),
            'updatedAt' => optional($template->updated_at)->toJSON(),
        ];
    }

    private function lookups(): array
    {
        return [
            'paperSizes' => $this->paperSizes,
            'orientations' => $this->orientations,
            'statuses' => $this->statuses,
            'documentTypes' => collect($this->documentTypes)
                ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])
                ->values(),
            'blockTypes' => collect($this->blockTypes)
                ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])
                ->values(),
            'tokens' => $this->tokens,
        ];
    }

    private function normalizeLayout(array $layout): array
    {
        $sections = (array) ($layout['sections'] ?? []);

        return [
            'schemaVersion' => (int) ($layout['schemaVersion'] ?? 1),
            'sections' => [
                'header' => array_values((array) ($sections['header'] ?? [])),
                'body' => array_values((array) ($sections['body'] ?? [])),
                'footer' => array_values((array) ($sections['footer'] ?? [])),
            ],
        ];
    }

    private function seedDefaults(): void
    {
        if (DocumentTemplate::query()->exists()) {
            return;
        }

        foreach ($this->defaultTemplates() as $template) {
            DocumentTemplate::create([
                ...$template,
                'created_by' => 'system',
                'updated_by' => 'system',
            ]);
        }
    }

    private function defaultTemplates(): array
    {
        return [
            $this->defaultTemplate('purchase-order', 'Purchase Order', 'purchase_order', [
                ['type' => 'field', 'label' => 'Supplier', 'token' => '{supplier.name}', 'section' => 'header'],
                ['type' => 'field', 'label' => 'Order number', 'token' => '{document.number}', 'section' => 'header'],
                ['type' => 'table', 'label' => 'Order lines', 'token' => '{lines.table}', 'section' => 'body'],
                ['type' => 'totals', 'label' => 'Order total', 'token' => '{totals.grandTotal}', 'section' => 'footer'],
            ]),
            $this->defaultTemplate('goods-received-note', 'Goods Received Note', 'goods_received_note', [
                ['type' => 'field', 'label' => 'Supplier', 'token' => '{supplier.name}', 'section' => 'header'],
                ['type' => 'field', 'label' => 'Receipt number', 'token' => '{document.number}', 'section' => 'header'],
                ['type' => 'table', 'label' => 'Received items', 'token' => '{lines.table}', 'section' => 'body'],
                ['type' => 'signature', 'label' => 'Received by', 'token' => '{prepared.by}', 'section' => 'footer'],
            ]),
            $this->defaultTemplate('picking-list', 'Picking List', 'picking_list', [
                ['type' => 'field', 'label' => 'Customer', 'token' => '{customer.name}', 'section' => 'header'],
                ['type' => 'field', 'label' => 'Delivery address', 'token' => '{delivery.address}', 'section' => 'header'],
                ['type' => 'table', 'label' => 'Items to pick', 'token' => '{lines.table}', 'section' => 'body'],
                ['type' => 'signature', 'label' => 'Checked by', 'token' => '{approved.by}', 'section' => 'footer'],
            ]),
            $this->defaultTemplate('payment-request', 'Payment Request', 'payment_request', [
                ['type' => 'field', 'label' => 'Supplier', 'token' => '{supplier.name}', 'section' => 'header'],
                ['type' => 'field', 'label' => 'Reference', 'token' => '{document.reference}', 'section' => 'header'],
                ['type' => 'totals', 'label' => 'Amount due', 'token' => '{totals.grandTotal}', 'section' => 'body'],
                ['type' => 'signature', 'label' => 'Approved by', 'token' => '{approved.by}', 'section' => 'footer'],
            ]),
            $this->defaultTemplate('shipping-label', 'Shipping Label', 'shipping_label', [
                ['type' => 'text', 'label' => 'Company', 'content' => '{company.name}', 'section' => 'header'],
                ['type' => 'field', 'label' => 'Ship to', 'token' => '{delivery.address}', 'section' => 'body'],
                ['type' => 'field', 'label' => 'Reference', 'token' => '{document.number}', 'section' => 'footer'],
            ], 'Label', 'landscape'),
        ];
    }

    private function defaultTemplate(
        string $code,
        string $name,
        string $type,
        array $blocks,
        string $paperSize = 'A4',
        string $orientation = 'portrait'
    ): array {
        $layout = ['schemaVersion' => 1, 'sections' => ['header' => [], 'body' => [], 'footer' => []]];

        foreach ($blocks as $index => $block) {
            $section = (string) ($block['section'] ?? 'body');
            unset($block['section']);
            $layout['sections'][$section][] = [
                'id' => (string) Str::uuid(),
                'type' => $block['type'],
                'label' => $block['label'] ?? '',
                'content' => $block['content'] ?? '',
                'token' => $block['token'] ?? '',
                'fontSize' => $block['type'] === 'text' ? 18 : 12,
                'align' => 'left',
                'width' => 'full',
                'emphasis' => $index === 0,
                'visible' => true,
            ];
        }

        return [
            'code' => $code,
            'name' => $name,
            'document_type' => $type,
            'description' => '',
            'paper_size' => $paperSize,
            'orientation' => $orientation,
            'margin_top' => 18,
            'margin_right' => 18,
            'margin_bottom' => 18,
            'margin_left' => 18,
            'layout_json' => $layout,
            'status' => 'active',
            'version' => 1,
        ];
    }

    private function uniqueCode(string $code): string
    {
        $base = Str::slug($code, '-');
        $candidate = $base;
        $suffix = 2;

        while (DocumentTemplate::withTrashed()->where('code', $candidate)->exists()) {
            $candidate = $base.'-'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    private function actor(Request $request): string
    {
        return substr((string) (
            $request->user()?->email
            ?? $request->user()?->name
            ?? $request->header('X-Akiva-User')
            ?? $request->header('X-User-Id')
            ?? 'api'
        ), 0, 120);
    }
}
