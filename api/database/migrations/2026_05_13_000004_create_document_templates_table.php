<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('document_templates')) {
            Schema::create('document_templates', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 160);
                $table->string('document_type', 80)->index();
                $table->text('description')->nullable();
                $table->string('paper_size', 20)->default('A4');
                $table->string('orientation', 20)->default('portrait');
                $table->unsignedSmallInteger('margin_top')->default(18);
                $table->unsignedSmallInteger('margin_right')->default(18);
                $table->unsignedSmallInteger('margin_bottom')->default(18);
                $table->unsignedSmallInteger('margin_left')->default(18);
                $table->json('layout_json');
                $table->string('status', 20)->default('active')->index();
                $table->unsignedInteger('version')->default(1);
                $table->string('created_by', 120)->nullable();
                $table->string('updated_by', 120)->nullable();
                $table->timestamps();
                $table->softDeletes();
            });

            return;
        }

        Schema::table('document_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('document_templates', 'code')) {
                $table->string('code', 80)->index()->after('id');
            }
            if (!Schema::hasColumn('document_templates', 'name')) {
                $table->string('name', 160)->after('code');
            }
            if (!Schema::hasColumn('document_templates', 'document_type')) {
                $table->string('document_type', 80)->index()->after('name');
            }
            if (!Schema::hasColumn('document_templates', 'description')) {
                $table->text('description')->nullable()->after('document_type');
            }
            if (!Schema::hasColumn('document_templates', 'paper_size')) {
                $table->string('paper_size', 20)->default('A4')->after('description');
            }
            if (!Schema::hasColumn('document_templates', 'orientation')) {
                $table->string('orientation', 20)->default('portrait')->after('paper_size');
            }
            if (!Schema::hasColumn('document_templates', 'margin_top')) {
                $table->unsignedSmallInteger('margin_top')->default(18)->after('orientation');
            }
            if (!Schema::hasColumn('document_templates', 'margin_right')) {
                $table->unsignedSmallInteger('margin_right')->default(18)->after('margin_top');
            }
            if (!Schema::hasColumn('document_templates', 'margin_bottom')) {
                $table->unsignedSmallInteger('margin_bottom')->default(18)->after('margin_right');
            }
            if (!Schema::hasColumn('document_templates', 'margin_left')) {
                $table->unsignedSmallInteger('margin_left')->default(18)->after('margin_bottom');
            }
            if (!Schema::hasColumn('document_templates', 'layout_json')) {
                $table->json('layout_json')->after('margin_left');
            }
            if (!Schema::hasColumn('document_templates', 'status')) {
                $table->string('status', 20)->default('active')->index()->after('layout_json');
            }
            if (!Schema::hasColumn('document_templates', 'version')) {
                $table->unsignedInteger('version')->default(1)->after('status');
            }
            if (!Schema::hasColumn('document_templates', 'created_by')) {
                $table->string('created_by', 120)->nullable()->after('version');
            }
            if (!Schema::hasColumn('document_templates', 'updated_by')) {
                $table->string('updated_by', 120)->nullable()->after('created_by');
            }
            if (!Schema::hasColumn('document_templates', 'created_at')) {
                $table->timestamp('created_at')->nullable()->after('updated_by');
            }
            if (!Schema::hasColumn('document_templates', 'updated_at')) {
                $table->timestamp('updated_at')->nullable()->after('created_at');
            }
            if (!Schema::hasColumn('document_templates', 'deleted_at')) {
                $table->softDeletes()->after('updated_at');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_templates');
    }
};
