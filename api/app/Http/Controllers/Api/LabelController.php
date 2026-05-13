<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LabelTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LabelController extends Controller
{
    private array $paperSizes = [
        'A4' => ['pageWidth' => 210, 'pageHeight' => 297],
        'A5' => ['pageWidth' => 148, 'pageHeight' => 210],
        'A3' => ['pageWidth' => 297, 'pageHeight' => 420],
        'Letter' => ['pageWidth' => 215.9, 'pageHeight' => 279.4],
        'Legal' => ['pageWidth' => 215.9, 'pageHeight' => 355.6],
        'Custom' => ['pageWidth' => 0, 'pageHeight' => 0],
    ];

    private array $fieldTypes = [
        'itemcode' => 'Item code',
        'itemdescription' => 'Item description',
        'barcode' => 'Item barcode',
        'price' => 'Price',
        'logo' => 'Company logo',
    ];

    private array $presets = [
        'full-page' => [
            'description' => 'Full page label',
            'pageWidth' => 210,
            'pageHeight' => 297,
            'height' => 297,
            'width' => 210,
            'topMargin' => 0,
            'leftMargin' => 0,
            'rowHeight' => 297,
            'columnWidth' => 210,
        ],
        'two-column' => [
            'description' => 'A4 two column labels',
            'pageWidth' => 210,
            'pageHeight' => 297,
            'height' => 38,
            'width' => 99.1,
            'topMargin' => 0,
            'leftMargin' => 0,
            'rowHeight' => 38.1,
            'columnWidth' => 105,
        ],
        'three-column' => [
            'description' => 'A4 three column labels',
            'pageWidth' => 210,
            'pageHeight' => 297,
            'height' => 30,
            'width' => 70,
            'topMargin' => 0,
            'leftMargin' => 0,
            'rowHeight' => 30,
            'columnWidth' => 70,
        ],
        'shelf-square' => [
            'description' => 'Shelf square labels',
            'pageWidth' => 210,
            'pageHeight' => 297,
            'height' => 51,
            'width' => 51,
            'topMargin' => 0,
            'leftMargin' => 0,
            'rowHeight' => 51,
            'columnWidth' => 51,
        ],
    ];

    public function index()
    {
        $this->seedDefaults();

        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request)
    {
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $label = DB::transaction(function () use ($request) {
            $label = LabelTemplate::create($this->labelValues($request));
            $this->syncFields($label, (array) $request->input('fields', []));
            return $label->fresh('fields');
        });

        return response()->json([
            'success' => true,
            'message' => 'Label template created.',
            'data' => [
                ...$this->payload(),
                'selectedId' => $label->labelid,
            ],
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $label = LabelTemplate::query()->findOrFail($id);
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        DB::transaction(function () use ($label, $request) {
            $label->update($this->labelValues($request));
            $this->syncFields($label, (array) $request->input('fields', []));
        });

        return response()->json([
            'success' => true,
            'message' => 'Label template saved.',
            'data' => [
                ...$this->payload(),
                'selectedId' => $id,
            ],
        ]);
    }

    public function destroy(int $id)
    {
        $label = LabelTemplate::query()->findOrFail($id);

        DB::transaction(function () use ($label) {
            $label->fields()->delete();
            $label->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Label template archived.',
            'data' => $this->payload(),
        ]);
    }

    private function validator(Request $request)
    {
        return Validator::make($request->all(), [
            'description' => ['required', 'string', 'max:50'],
            'pageWidth' => ['required', 'numeric', 'min:1', 'max:1000'],
            'pageHeight' => ['required', 'numeric', 'min:1', 'max:1000'],
            'height' => ['required', 'numeric', 'min:1', 'max:1000'],
            'width' => ['required', 'numeric', 'min:1', 'max:1000'],
            'topMargin' => ['required', 'numeric', 'min:0', 'max:1000'],
            'leftMargin' => ['required', 'numeric', 'min:0', 'max:1000'],
            'rowHeight' => ['required', 'numeric', 'min:1', 'max:1000'],
            'columnWidth' => ['required', 'numeric', 'min:1', 'max:1000'],
            'fields' => ['nullable', 'array'],
            'fields.*.fieldValue' => ['required_with:fields', 'string', Rule::in(array_keys($this->fieldTypes))],
            'fields.*.vPos' => ['required_with:fields', 'numeric', 'min:0', 'max:1000'],
            'fields.*.hPos' => ['required_with:fields', 'numeric', 'min:0', 'max:1000'],
            'fields.*.fontSize' => ['required_with:fields', 'integer', 'min:4', 'max:96'],
            'fields.*.barcode' => ['required_with:fields', 'boolean'],
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

    private function labelValues(Request $request): array
    {
        return [
            'description' => trim((string) $request->input('description')),
            'pagewidth' => (float) $request->input('pageWidth'),
            'pageheight' => (float) $request->input('pageHeight'),
            'height' => (float) $request->input('height'),
            'width' => (float) $request->input('width'),
            'topmargin' => (float) $request->input('topMargin'),
            'leftmargin' => (float) $request->input('leftMargin'),
            'rowheight' => (float) $request->input('rowHeight'),
            'columnwidth' => (float) $request->input('columnWidth'),
        ];
    }

    private function syncFields(LabelTemplate $label, array $fields): void
    {
        $label->fields()->delete();

        foreach ($fields as $field) {
            $label->fields()->create([
                'fieldvalue' => (string) $field['fieldValue'],
                'vpos' => (float) $field['vPos'],
                'hpos' => (float) $field['hPos'],
                'fontsize' => (int) $field['fontSize'],
                'barcode' => (bool) $field['barcode'],
            ]);
        }
    }

    private function payload(): array
    {
        $labels = LabelTemplate::query()
            ->with('fields')
            ->orderBy('description')
            ->get()
            ->map(fn (LabelTemplate $label) => $this->serialize($label))
            ->values();

        return [
            'labels' => $labels,
            'lookups' => [
                'paperSizes' => collect($this->paperSizes)
                    ->map(fn ($dimensions, $name) => ['name' => $name, ...$dimensions])
                    ->values(),
                'fieldTypes' => collect($this->fieldTypes)
                    ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])
                    ->values(),
                'presets' => collect($this->presets)
                    ->map(fn ($preset, $key) => ['key' => $key, ...$preset])
                    ->values(),
            ],
            'stats' => [
                'templates' => $labels->count(),
                'fields' => $labels->sum(fn ($label) => count($label['fields'])),
            ],
        ];
    }

    private function serialize(LabelTemplate $label): array
    {
        return [
            'id' => (int) $label->labelid,
            'description' => (string) $label->description,
            'pageWidth' => (float) $label->pagewidth,
            'pageHeight' => (float) $label->pageheight,
            'height' => (float) $label->height,
            'width' => (float) $label->width,
            'topMargin' => (float) $label->topmargin,
            'leftMargin' => (float) $label->leftmargin,
            'rowHeight' => (float) $label->rowheight,
            'columnWidth' => (float) $label->columnwidth,
            'rows' => $label->rowheight > 0 ? (int) floor(($label->pageheight - $label->topmargin) / $label->rowheight) : 0,
            'columns' => $label->columnwidth > 0 ? (int) floor(($label->pagewidth - $label->leftmargin) / $label->columnwidth) : 0,
            'fields' => $label->fields->map(fn ($field) => [
                'id' => (int) $field->labelfieldid,
                'fieldValue' => (string) $field->fieldvalue,
                'vPos' => (float) $field->vpos,
                'hPos' => (float) $field->hpos,
                'fontSize' => (int) $field->fontsize,
                'barcode' => (bool) $field->barcode,
            ])->values(),
            'createdAt' => optional($label->created_at)->toJSON(),
            'updatedAt' => optional($label->updated_at)->toJSON(),
        ];
    }

    private function seedDefaults(): void
    {
        $existing = LabelTemplate::query()->orderBy('labelid')->first();
        if ($existing) {
            if (DB::table('labelfields')->where('labelid', 0)->exists() && !$existing->fields()->exists()) {
                DB::table('labelfields')->where('labelid', 0)->update(['labelid' => $existing->labelid]);
            }

            if (!$existing->fields()->exists() && LabelTemplate::query()->count() === 1) {
                $existing->fields()->createMany($this->defaultFields());
            }

            return;
        }

        $label = LabelTemplate::create([
            'description' => 'Item price label',
            'pagewidth' => 210,
            'pageheight' => 297,
            'height' => 30,
            'width' => 70,
            'topmargin' => 0,
            'leftmargin' => 0,
            'rowheight' => 30,
            'columnwidth' => 70,
        ]);

        $label->fields()->createMany($this->defaultFields());
    }

    private function defaultFields(): array
    {
        return [
            ['fieldvalue' => 'itemcode', 'vpos' => 6, 'hpos' => 5, 'fontsize' => 10, 'barcode' => true],
            ['fieldvalue' => 'itemdescription', 'vpos' => 14, 'hpos' => 5, 'fontsize' => 8, 'barcode' => false],
            ['fieldvalue' => 'price', 'vpos' => 24, 'hpos' => 5, 'fontsize' => 11, 'barcode' => false],
        ];
    }
}
