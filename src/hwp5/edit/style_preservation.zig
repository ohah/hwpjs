//! Experimental proof: one editable model with an immutable HWP5 sidecar.
//! Controlled style references and plain-text splices; no layout engine.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const projection = @import("../model_projection.zig");
const model = @import("../../model/document.zig");
const framing = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Tag = @import("../body/reader.zig").Tag;
const cfb = @import("../../cfb/reader.zig");
pub const TextSplice = @import("plain_text.zig").Splice;
pub const CharacterFormat = @import("character_format.zig").Edit;
const max_bytes = 64 * 1024 * 1024;
const max_stream = 32 * 1024 * 1024;
const created_table_limits: @import("created_table_records.zig").Limits = .{ .max_cells = 100000, .max_bytes = max_stream };

pub const ParagraphInfo = struct { source_node: ?u32, parent_node: ?u32, style_id: u8 };
pub const Command = union(enum) {
    edit_equation_script: @import("equation_script_edit.zig").Request,
    edit_chart_literals: @import("../chart/literal_edit_request.zig").Request,
    insert_image: @import("image_create_request.zig").Request,
    replace_picture: @import("picture_replacement_current.zig").Request,
    insert_chart: @import("../chart/create_request.zig").Request,
    insert_equation: @import("equation_create_request.zig").Request,
    stage_table: @import("created_table_stage.zig").Edit,
    set_created_cell_text: @import("created_cell_text.zig").Edit,
    splice_created_cell: @import("../../model/created_cell_typing.zig").Edit,
    edit_created_table_grid: @import("created_table_grid_session.zig").Edit,
    edit_created_cell_properties: @import("../../model/created_cell_properties_values.zig").Request,
    split_source_table_cell: @import("source_table_cell_split_service.zig").Edit,
    edit_source_table_grid: @import("source_table_grid_session.zig").Edit,
    splice_current_paragraph: @import("current_paragraph_edit.zig").Splice,
    set_style: struct { section: usize, paragraph: usize, style_id: u8 },
    insert_text: struct { section: usize, paragraph: usize, utf8: []const u8 },
    delete_paragraph: struct { section: usize, paragraph: usize },
    splice_text: TextSplice,
    splice_independent_text: []const @import("independent_text_session.zig").Group,
    splice_document_text: []const @import("document_text_session.zig").Group,
    set_character_format: CharacterFormat,
    set_character_properties: @import("character_property_apply.zig").Edit,
    set_character_grouped_insertion: @import("character_property_apply.zig").GroupEdit,
    set_character_font_name: struct { section: usize, paragraph: usize, start_unit: u32, end_unit: u32, language: @import("../../model/character_fonts.zig").Language, name: []const u8 },
    split_paragraph: @import("structure_session.zig").Split,
    merge_paragraph: @import("merge_session.zig").Merge,
    set_cell_size: @import("table_cell_size_values.zig").Edit,
    set_cell_background: @import("cell_background_values.zig").Edit,
    set_cell_border: @import("cell_border_values.zig").Edit,
    /// Borrowed for synchronous apply; history retains owned checkpoints only.
    set_cell_borders: []const @import("cell_border_values.zig").Edit,
    set_cell_fills: []const @import("h5cell_fill_batch.zig").Request,
    set_cell_styles: []const @import("h5cell_style_batch.zig").Request,
    set_picture_current_size: @import("picture_current_size_values.zig").Edit,
    resize_picture: @import("picture_resize_values.zig").Edit,
    resize_picture_anchored: @import("picture_anchored_resize.zig").Request,
    set_paragraph_format: @import("paragraph_format.zig").Edit,
    set_paragraph_bullet: struct { section: usize, paragraph: usize, value: @import("../../model/formatting_patch.zig").Bullet },
    edit_object_geometry: *const @import("../../model/object_geometry.zig").Request,
    edit_object_outer_margins: @import("object_outer_margins.zig").Request,
    edit_object_vertical_margins: @import("object_outer_margins.zig").Request,
    set_cell_vertical_alignment: @import("cell_vertical_alignment_plan.zig").Request,
    set_cell_vertical_alignment_block: @import("cell_vertical_alignment_batch_plan.zig").Request,
    edit_page_restart: @import("page_restart_history.zig").Request,
    edit_page_settings: *const @import("page_settings_types.zig").Request,
    edit_bullet_definition: @import("../../model/paragraph_bullet_definition.zig").Request,
    set_paragraph_alignment: struct { section: usize, paragraph: usize, alignment: u32 },
    set_paragraph_border_fill: struct { section: usize, paragraph: usize, patch: @import("../../model/border_fill_patch.zig").Patch, flags: @import("../../model/paragraph_flags.zig").Patch = .{} },
    set_paragraph_flags: struct { section: usize, paragraph: usize, flags: @import("../../model/paragraph_flags.zig").Patch },
    set_paragraph_margins: struct { section: usize, paragraph: usize, margins: model.ParagraphMarginPatch },
    set_paragraph_spacing: struct { section: usize, paragraph: usize, spacing: model.ParagraphSpacing },
    set_formula_definition: @import("formula_definition.zig").Edit,
    set_form_text: @import("form_text_apply.zig").Edit,
    set_form_choice: @import("form_choice_apply.zig").Edit,
    select_form_radio: @import("form_radio_apply.zig").Edit,
    set_cell_insets: @import("cell_insets_plan.zig").Request,
};
pub const SaveOptions = struct {
    /// Byte-preservation experiments only; does not certify Hancom layout.
    allow_stale_layout: bool = false,
    /// Trusted internal host measurement. Never a public caller certification.
    strict_layout: ?@import("strict_plain_layout.zig").Request = null,
    max_output_bytes: usize = max_bytes,
};
pub const Saved = struct { bytes: []u8, layout_requires_reflow: bool };
pub const Checkpoint = @import("table_checkpoint.zig").Checkpoint;

// Allocated once; the public opaque pointer prevents direct model/sidecar writes.
const State = struct {
    chart_resources: @import("../chart/created_resources.zig").Values = .{},
    cell_backgrounds: @import("cell_background_values.zig").Values = .{},
    formatting_batch: ?*FormattingBatch = null,
    live_text: ?@import("live_text_backing.zig").Backing = null,
    live_incarnation: u64 = 0,
    live_totals: @import("live_text_backing.zig").Counters = .{},
    strict_layout_serial: u64 = 0,
    strict_layout_lease: ?*@import("strict_plain_layout.zig").Lease = null,
    history_epoch: ?@import("../../model/history_mutation_epoch.zig").Barrier = null,
    history_poison_observer: ?*bool = null,
    allocator: std.mem.Allocator,
    source: Source,
    has_source_rebases: bool = false,
    original_decoded: [][]u8,
    decoded: [][]u8,
    document: model.Document,
    created_tables: []@import("created_table_values.zig").Values,
    original_style_offsets: [][]usize,
    style_offsets: [][]usize,
    style_count: usize,
    char_count: usize,
    para_count: usize,
    border_count: usize,
    memo_shape_count: usize,
    observed_docinfo: ?@import("observed_docinfo.zig").Diagnostics = null,

    // Views never own source bytes. A restored model carries its exact source basis.
    fn refreshSourceViews(self: *State) void {
        self.has_source_rebases = false;
        for (self.document.sections, 0..) |section, i| {
            if (section.rebased_source != null) self.has_source_rebases = true;
            self.decoded[i] = if (section.rebased_source) |basis| basis.bytes else self.original_decoded[i];
            self.style_offsets[i] = if (section.rebased_source) |basis| basis.style_offsets else self.original_style_offsets[i];
        }
    }

    fn deinit(self: *State) void {
        const a = self.allocator;
        if (self.strict_layout_lease) |lease| lease.close();
        if (self.live_text) |*backing| backing.deinit();
        for (self.original_style_offsets) |offsets| a.free(offsets);
        a.free(self.original_style_offsets);
        a.free(self.style_offsets);
        self.cell_backgrounds.deinit(a);
        self.chart_resources.deinit(a);
        self.document.deinit(a);
        for (self.created_tables) |*tables| tables.deinit(a);
        a.free(self.created_tables);
        for (self.original_decoded) |bytes| a.free(bytes);
        a.free(self.original_decoded);
        a.free(self.decoded);
        self.source.deinit();
    }
};

/// Request-only original-input preparation. History remains the transaction owner.
/// This is not a replacement for the pending resource/paragraph COW journal.
pub const FormattingBatch = struct {
    original_info: ?[]u8 = null,
    characters: @import("character_property_apply.zig").Context = .{},
    docinfo_decodes: usize = 0,
    grouped_work: @import("character_property_apply.zig").Work = if (@import("builtin").is_test) .{} else {},
    grouped_source: ?[]const []u8 = null,
    grouped_version: u32 = 0,
    grouped_excluded_section: ?usize = null,
    pub fn deinit(self: *FormattingBatch, a: std.mem.Allocator) void {
        self.characters.deinit(a);
        if (self.original_info) |bytes| a.free(bytes);
        self.* = .{};
    }
};

pub const Session = opaque {
    fn formattingDocument(self: *const Session) model.Document {
        const state = self.stateConst();
        var current = state.document;
        if (state.formatting_batch) |context| current.character_resources = @constCast(context.characters.entries(&state.document));
        return current;
    }
    pub fn finishFormattingBatch(self: *Session) !void {
        const state = self.getState();
        const context = state.formatting_batch orelse return;
        errdefer context.characters.abort(state.allocator);
        if (context.characters.disabled or context.characters.installed or !context.characters.changed) return;
        const info = context.original_info orelse return error.FormattingBatchNotPrepared;
        const current = self.formattingDocument();
        const verified = try @import("resource_docinfo.zig").writeBatch(state.allocator, info, state.source.header.version(), &current, state.para_count, state.char_count, max_stream);
        defer state.allocator.free(verified);
        try context.characters.install(state.allocator, &state.document);
        context.characters.final_flushes += 1;
    }
    pub fn beginFormattingBatch(self: *Session, context: *FormattingBatch) !void {
        if (self.getState().formatting_batch != null) return error.FormattingBatchAlreadyActive;
        self.getState().formatting_batch = context;
    }
    pub fn endFormattingBatch(self: *Session, context: *FormattingBatch) void {
        const state = self.getState();
        if (state.formatting_batch == context) state.formatting_batch = null;
        context.deinit(state.allocator);
    }
    fn originalInfo(self: *Session) !struct { bytes: []const u8, owned: bool } {
        const state = self.getState();
        if (state.formatting_batch) |context| {
            if (context.original_info == null) {
                context.original_info = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream);
                context.docinfo_decodes += 1;
            }
            return .{ .bytes = context.original_info.?, .owned = false };
        }
        return .{ .bytes = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream), .owned = true };
    }

    /// 기존 WASM open 내부 전용 관리 연결. 모델/포인터를 외부에 내보내지 않는다.
    pub fn enableHistoryDelta(self: *Session) void {
        if (self.getState().history_epoch == null) self.getState().history_epoch = .{ .binding = .{ .document = @intFromPtr(self), .generation = 1, .owner = @intFromPtr(self) } };
    }
    pub fn historyTransactionActive(self: *const Session) bool {
        return if (self.stateConst().history_epoch) |b| b.active else false;
    }
    pub fn historyDeltaEnabled(self: *const Session) bool {
        return self.stateConst().history_epoch != null;
    }
    pub fn historyTicket(self: *const Session) !@import("../../model/history_mutation_epoch.zig").Ticket {
        const b = self.stateConst().history_epoch orelse return error.HistoryDeltaCoverageIncomplete;
        if (b.poisoned) return error.HistoryMutationUncertain;
        return b.ticket();
    }
    pub fn beginHistoryTransaction(self: *Session, ticket: @import("../../model/history_mutation_epoch.zig").Ticket) !void {
        self.invalidateStrictLayout();
        const b = &self.getState().history_epoch.?;
        try b.begin(ticket);
    }
    pub fn finishHistoryTransaction(self: *Session, wrote: bool) void {
        const b = &self.getState().history_epoch.?;
        if (wrote) b.finish() else b.cancelBeforeWrite();
    }
    /// Session이 poison 권위다. 등록된 History의 기존 stats flag도 즉시 sticky 전파한다.
    pub fn poisonHistoryTransaction(self: *Session) void {
        self.invalidateStrictLayout();
        const state = self.getState();
        state.history_epoch.?.uncertain();
        if (state.history_poison_observer) |flag| flag.* = true;
    }
    pub fn registerHistoryPoisonObserver(self: *Session, flag: *bool) !void {
        const state = self.getState();
        if (state.history_epoch == null) return error.HistoryDeltaCoverageIncomplete;
        if (state.history_poison_observer != null) return error.HistoryAlreadyEnabled;
        if (state.history_epoch.?.poisoned) {
            flag.* = true;
            return error.HistoryMutationUncertain;
        }
        flag.* = false;
        state.history_poison_observer = flag;
    }
    pub fn unregisterHistoryPoisonObserver(self: *Session, flag: *bool) void {
        const state = self.getState();
        if (state.history_poison_observer) |current| {
            if (current == flag) state.history_poison_observer = null;
        }
    }
    fn externalHistoryBegin(self: *Session) !?*Checkpoint {
        const state = self.getState();
        if (state.history_epoch == null or state.history_epoch.?.active) return null;
        const ticket = try self.historyTicket();
        const before = try self.createCheckpoint(max_bytes);
        errdefer before.deinit();
        try self.beginHistoryTransaction(ticket);
        return before;
    }
    fn externalHistoryEnd(self: *Session, before: ?*Checkpoint, failure: ?anyerror) !void {
        if (before) |snapshot| {
            defer snapshot.deinit();
            const same = self.matchesCheckpoint(snapshot) catch {
                self.poisonHistoryTransaction();
                return error.MutationUncertain;
            };
            if (failure != null and !same) {
                self.rollbackHistoryCheckpointBody(snapshot) catch {
                    self.poisonHistoryTransaction();
                    return error.MutationUncertain;
                };
                self.finishHistoryTransaction(true);
            } else self.finishHistoryTransaction(!same);
        }
        if (failure) |err| return err;
    }
    fn historyDeltaFallback(comptime reason: []const u8) ?@import("history_text_journal.zig").Prepared {
        if (comptime @import("builtin").is_test) std.debug.print("\nHWP5 delta 제외 이유={s}\n", .{reason});
        return null;
    }
    pub fn prepareHistoryTextDelta(self: *Session, storage: std.mem.Allocator, command: Command, limit: usize) !?@import("history_text_journal.zig").Prepared {
        const state = self.getState();
        if (state.history_epoch == null or !state.history_epoch.?.active) return error.MutationInProgress;
        const edit: TextSplice = switch (command) {
            .splice_text => |v| v,
            .splice_current_paragraph => |v| switch (v.reference) {
                .created_cell => return historyDeltaFallback("생성 셀은 기존 bridge"),
                .source => |ref| blk: {
                    if (ref.section != v.section) return error.SourceBindingMismatch;
                    if (v.section >= state.document.sections.len) return error.InvalidSection;
                    const index = resolve: {
                        if (state.live_text) |backing| {
                            if (backing.section == v.section and ref.host == .original_node and ref.host.original_node == backing.source_node) break :resolve backing.paragraph;
                            try self.materializeLiveText();
                        }
                        const resolved = try @import("created_table_anchor.zig").resolve(state.allocator, &state.document.sections[v.section], .{ .host = ref.host, .unit = 0 });
                        state.live_totals.source_copy_units += state.document.sections[v.section].paragraphs[resolved].declared_units;
                        break :resolve resolved;
                    };
                    break :blk .{ .section = v.section, .paragraph = index, .start_unit = v.start_unit, .end_unit = v.end_unit, .utf8 = v.utf8 };
                },
            },
            else => {
                try self.materializeLiveText();
                return historyDeltaFallback("텍스트 외 명령은 기존 bridge");
            },
        };
        if (edit.section >= state.document.sections.len) return error.InvalidSection;
        if (edit.paragraph >= state.document.sections[edit.section].paragraphs.len) return error.InvalidParagraph;
        if (state.live_text) |*backing| {
            const current = state.document.sections[edit.section].paragraphs[edit.paragraph];
            if (backing.section == edit.section and backing.paragraph == edit.paragraph and current.source_node == backing.source_node and current.parent_node == backing.parent_node) {
                var bound = state.history_epoch.?.binding;
                bound.owner = (@as(u64, @intCast(edit.section)) << 32) | backing.source_node;
                return try @import("history_text_journal.zig").prepareLive(state.allocator, storage, bound, backing, current, edit, limit, state.live_incarnation, state.history_epoch.?.epoch);
            }
            try self.materializeLiveText();
        }
        const p = state.document.sections[edit.section].paragraphs[edit.paragraph];
        if (p.source_node == null or p.header_template != null or !p.text_present or p.tokens.len == 0 or (p.range_tags != null and p.range_tags.?.len != 0) or p.field_attributes != null or p.formula_results != null) {
            if (comptime @import("builtin").is_test) std.debug.print("\nHWP5 delta 기본조건: source={any} parent={any} template={any} text={} tokens={d} range존재={} field존재={} formula존재={}\n", .{ p.source_node, p.parent_node, p.header_template, p.text_present, p.tokens.len, p.range_tags != null, p.field_attributes != null, p.formula_results != null });
            return historyDeltaFallback("문단 기본조건");
        }
        for (state.created_tables) |tables| if (tables.entries.len != 0) return historyDeltaFallback("보류 중인 생성 표");
        const source = state.decoded[edit.section];
        if (try @import("company_source.zig").has(source)) return historyDeltaFallback("회사 필드 전용 거래");
        if (try @import("source_policy.zig").hasNamedFields(source)) return historyDeltaFallback("이름 있는 필드 전용 거래");
        if (try @import("source_policy.zig").hasFormulas(state.allocator, source, state.source.header.version())) return historyDeltaFallback("수식 전용 거래");
        if (try @import("hyperlink_splice.zig").hasCrossParagraph(state.allocator, state.document.sections[edit.section])) return historyDeltaFallback("문단을 가로지르는 링크");
        const validated = @import("plain_text_source.zig").validate(state.allocator, source, state.source.header.version(), p, self.characterShapeCount()) catch |err| {
            if (err == error.OutOfMemory) return err;
            if (comptime @import("builtin").is_test) std.debug.print("\nHWP5 plain 검증 오류={s}\n", .{@errorName(err)});
            return historyDeltaFallback("기존 plain 검증 대상 밖");
        };
        if (validated.preserved_direct_records != 0 or (validated.ranges != null and validated.ranges.?.count() != 0)) return historyDeltaFallback("보존 direct record 또는 원본 range");
        // 중첩 여부만으로 제외하지 않는다. 원본 parent/source 검증은 위 validator가 소유한다.
        // 기존 memo/구조 거래와 같은 수식 결과·참조 셀 보호를 추가로 확인한다.
        if (p.parent_node != null) @import("formula_structure_scope.zig").validate(state.allocator, source, state.source.header.version(), p) catch |err| {
            if (err == error.OutOfMemory) return err;
            return historyDeltaFallback("중첩 owner 수식 보호 범위");
        };

        for (state.decoded, 0..) |bytes, index| if (index != edit.section) try @import("source_policy.zig").validateUnselectedTextSection(state.allocator, bytes, state.source.header.version());
        var binding = state.history_epoch.?.binding;
        if (edit.section > std.math.maxInt(u32)) return error.LimitExceeded;
        binding.owner = (@as(u64, @intCast(edit.section)) << 32) | p.source_node.?;
        if (try self.startLiveText(edit.section, edit.paragraph)) {
            return try @import("history_text_journal.zig").prepareLive(state.allocator, storage, binding, &state.live_text.?, p, edit, limit, state.live_incarnation, state.history_epoch.?.epoch);
        }
        return try @import("history_text_journal.zig").prepare(state.allocator, storage, binding, source, state.source.header.version(), p, edit, self.characterShapeCount(), limit);
    }
    fn checkHistoryDeltaOwner(self: *Session, d: *const @import("history_text_journal.zig").Delta) !*model.Paragraph {
        const state = self.getState();
        const b = state.history_epoch orelse return error.SourceBindingMismatch;
        if (!b.active or b.binding.document != d.record.binding.document or b.binding.generation != d.record.binding.generation) return error.SourceBindingMismatch;
        if (d.section >= state.document.sections.len or d.paragraph >= state.document.sections[d.section].paragraphs.len) return error.SourceBindingMismatch;
        const p = &state.document.sections[d.section].paragraphs[d.paragraph];
        if (d.section > std.math.maxInt(u32) or p.source_node == null) return error.SourceBindingMismatch;
        if (d.record.binding.owner != ((@as(u64, @intCast(d.section)) << 32) | p.source_node.?)) return error.SourceBindingMismatch;
        return p;
    }
    /// 호출 전 모든 할당·budget plan을 끝낸다. 교환 뒤 새로 할당하지 않는다.
    pub fn swapHistoryTextDraft(self: *Session, prepared: *@import("history_text_journal.zig").Prepared) !void {
        const p = try self.checkHistoryDeltaOwner(&prepared.delta);
        if (prepared.live) |*live| {
            const state = self.getState();
            const backing = if (state.live_text) |*value| value else return error.HistoryCurrentMismatch;
            if (backing.section != prepared.delta.section or backing.paragraph != prepared.delta.paragraph or
                live.incarnation != state.live_incarnation or live.expected_serial != backing.serial or
                live.transaction_epoch != state.history_epoch.?.epoch) return error.HistoryCurrentMismatch;
            const expected = if (prepared.reversed) prepared.delta.after else prepared.delta.before;
            if (!expected.matches(p.*)) return error.HistoryCurrentMismatch;
            const record = prepared.delta.record;
            const remove = if (prepared.reversed) record.inserted else record.removed;
            const insert = if (prepared.reversed) record.removed else record.inserted;
            if (!backing.matches(record.range.start, remove)) return error.HistoryCurrentMismatch;
            backing.spliceReserved(record.range.start, remove.len, insert);
            std.mem.swap([]model.CharacterRun, &p.character_runs, &live.runs);
            std.mem.swap(u32, &p.declared_units, &live.declared_units);
            std.mem.swap(?[]model.TextRange, &p.range_tags, &live.ranges);
            std.mem.swap(usize, &p.deferred_direct_records, &live.deferred);
            live.expected_serial = backing.serial;
            prepared.reversed = !prepared.reversed;
            return;
        }
        if (prepared.draft) |*draft| std.mem.swap(model.Paragraph, p, draft) else return error.HistoryCurrentMismatch;
    }
    pub fn restoreHistoryTextDelta(self: *Session, d: *const @import("history_text_journal.zig").Delta, redo: bool) !void {
        const p = try self.checkHistoryDeltaOwner(d);
        const state = self.getState();
        const expected = if (redo) d.before else d.after;
        const target = if (redo) d.after else d.before;
        if (!expected.matches(p.*)) return error.HistoryCurrentMismatch;
        if (state.live_text == null) _ = try self.startLiveText(d.section, d.paragraph);
        if (state.live_text) |*backing| {
            if (backing.section == d.section and backing.paragraph == d.paragraph and backing.source_node == p.source_node.? and backing.parent_node == p.parent_node) {
                const removed = if (redo) d.record.removed else d.record.inserted;
                const inserted = if (redo) d.record.inserted else d.record.removed;
                if (!backing.matches(d.record.range.start, removed)) return error.HistoryCurrentMismatch;
                try backing.boundary(d.record.range.start);
                try backing.boundary(d.record.range.start + removed.len);
                const runs = try state.allocator.dupe(model.CharacterRun, target.runs);
                errdefer state.allocator.free(runs);
                const ranges = if (target.range_present) try state.allocator.alloc(model.TextRange, 0) else null;
                errdefer if (ranges) |rows| state.allocator.free(rows);
                try backing.reserve(inserted.len -| removed.len);
                backing.spliceReserved(d.record.range.start, removed.len, inserted);
                state.allocator.free(p.character_runs);
                p.character_runs = runs;
                if (p.range_tags) |rows| state.allocator.free(rows);
                p.range_tags = ranges;
                backing.counters.run_rows_copied += runs.len;
                p.declared_units = target.declared_units;
                p.text_present = target.text_present;
                p.deferred_direct_records = target.deferred;
                return;
            }
            try self.materializeLiveText();
        }
        var draft = try @import("history_text_journal.zig").restoreDraft(state.allocator, state.decoded[d.section], state.source.header.version(), p.*, d, redo, self.characterShapeCount());
        defer draft.deinit(state.allocator);
        std.mem.swap(model.Paragraph, p, &draft);
    }

    pub fn liveTextCounters(self: *const Session) @import("live_text_backing.zig").Counters {
        var out = self.stateConst().live_totals;
        if (self.stateConst().live_text) |backing| {
            inline for (@typeInfo(@TypeOf(out)).@"struct".field_names) |field_name| {
                @field(out, field_name) += @field(backing.counters, field_name);
            }
        }
        return out;
    }
    fn startLiveText(self: *Session, section: usize, index: usize) !bool {
        const state = self.getState();
        if (state.live_text != null) return false;
        const p = state.document.sections[section].paragraphs[index];
        if (!p.text_present or p.source_node == null or p.header_template != null or p.tokens.len == 0 or p.character_runs.len == 0 or p.field_attributes != null or p.formula_results != null or (p.range_tags != null and p.range_tags.?.len != 0)) return false;
        // canonical text+CR에만 gap을 사용한다. 다른 retained control은 r5 유지.
        for (p.tokens, 0..) |t, i| {
            if (t.encoding != .utf16le) return false;
            if (t.kind == .control and !(i + 1 == p.tokens.len and t.raw.len == 2 and std.mem.readInt(u16, t.raw[0..2], .little) == 13)) return false;
        }
        const bytes = try @import("plain_text_content.zig").textBytes(state.allocator, p);
        defer state.allocator.free(bytes);
        try @import("token_ownership.zig").validate(p, bytes);
        try @import("control_boundaries.zig").validateRetainedText(bytes);
        try @import("character_runs.zig").validate(p.character_runs, bytes, self.characterShapeCount());
        if (state.live_incarnation == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        state.live_text = try @import("live_text_backing.zig").Backing.init(state.allocator, bytes, section, index, p.source_node.?, p.parent_node);
        state.live_incarnation += 1;
        // initial textBytes도 source copy로 센다.
        state.live_text.?.counters.source_copy_units += bytes.len / 2;
        return true;
    }
    fn materializeLiveText(self: *const Session) !void {
        const state = @constCast(self.stateConst());
        if (state.live_text) |*backing| {
            const p = &state.document.sections[backing.section].paragraphs[backing.paragraph];
            if (p.source_node != backing.source_node or p.parent_node != backing.parent_node or p.declared_units != backing.len()) return error.SourceBindingMismatch;
            const bytes = try backing.materialize(state.allocator);
            defer state.allocator.free(bytes);
            const tokens = try @import("token_ownership.zig").fromText(state.allocator, bytes);
            // token 생성도 별도 전체복사다. 논리 materialize에 포함해 숨기지 않는다.
            backing.counters.materialize_units += bytes.len / 2;
            for (p.tokens) |t| state.allocator.free(t.raw);
            state.allocator.free(p.tokens);
            p.tokens = tokens;
            inline for (@typeInfo(@TypeOf(state.live_totals)).@"struct".field_names) |field_name| {
                @field(state.live_totals, field_name) += @field(backing.counters, field_name);
            }
            backing.deinit();
            state.live_text = null;
        }
    }
    /// 저장 모델을 변경하지 않고 원본 문단 토큰과 빈 본문 여부를 관찰합니다.
    pub fn displayTextPresence(self: *const Session, section: usize, index: usize) !struct { source_node: ?u32, declared_units: usize, token_count: usize, raw_units: usize, observed_empty: bool } {
        // RN 전체 토큰 관측 경계: pending gap의 stale canonical token 노출을 금지한다.
        try self.materializeLiveText();
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const p = self.stateConst().document.sections[section].paragraphs[index];
        var bytes: usize = 0;
        for (p.tokens) |t| bytes = try std.math.add(usize, bytes, t.raw.len);
        return .{ .source_node = p.source_node, .declared_units = p.declared_units, .token_count = p.tokens.len, .raw_units = bytes / 2, .observed_empty = p.tokens.len == 0 and p.declared_units <= 1 };
    }

    /// 새 표 생성에 적용하는 자원 상한을 반환합니다.
    pub fn tableCreationLimits() @import("created_table_records.zig").Limits {
        return created_table_limits;
    }
    /// Native planning only; current generated cells are not yet projected.
    pub fn planTableIds(self: *const Session, cells: usize) !@import("created_table_ids.zig").Plan {
        try self.materializeLiveText();
        return self.planTableIdsWithAllocator(self.stateConst().allocator, cells);
    }

    pub fn planTableIdsWithAllocator(self: *const Session, allocator: std.mem.Allocator, cells: usize) !@import("created_table_ids.zig").Plan {
        try self.materializeLiveText();
        if (cells > created_table_limits.max_cells) return error.LimitExceeded;
        const state = self.stateConst();
        return @import("created_table_ids.zig").plan(allocator, state.decoded, state.source.header.version(), &state.document, state.created_tables, cells, 2_000_000);
    }

    pub fn pendingTableCount(self: *const Session, section: usize) !usize {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.created_tables.len) return error.InvalidSection;
        return state.created_tables[section].entries.len;
    }

    pub fn createdTables(self: *const Session, allocator: std.mem.Allocator, section: usize) ![]@import("created_table_snapshot.zig").Row {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.created_tables.len) return error.InvalidSection;
        return @import("created_table_snapshot.zig").read(allocator, &state.document.sections[section], &state.created_tables[section]);
    }

    /// Read only: materialize the exact save resource policy on detached clones.
    /// Separate additive observation; existing v1 JSON remains byte-shape compatible.
    pub fn createdCellVerticalAlignmentProjection(self: *const Session, allocator: std.mem.Allocator) ![]u8 {
        try self.materializeLiveText();
        const state = self.stateConst();
        var builder = @import("../../model/created_cell_vertical_alignment_projection.zig").Builder.init(allocator, max_stream);
        defer builder.deinit();
        for (state.created_tables, 0..) |tables, section| for (tables.entries) |entry| {
            _ = try @import("created_table_anchor.zig").resolve(allocator, &state.document.sections[section], entry.anchor);
            const base = @import("../../model/cell_vertical_alignment.zig").fromRaw((entry.value.options.cell.attributes >> 5) & 3);
            try builder.appendTable(section, &entry.value.table, base);
        };
        return builder.json("hwp5");
    }
    pub fn createdCellPropertyStyles(self: *const Session, allocator: std.mem.Allocator) ![]@import("../../model/created_cell_properties_projection.zig").Style {
        return self.createdCellPropertyStylesWithStats(allocator, null);
    }

    pub fn createdCellPropertyStylesWithStats(self: *const Session, allocator: std.mem.Allocator, stats: ?*@import("../../model/created_cell_properties_projection.zig").Stats) ![]@import("../../model/created_cell_properties_projection.zig").Style {
        try self.materializeLiveText();
        const state = self.stateConst();
        var any = false;
        for (state.created_tables) |values| if (values.entries.len != 0) {
            any = true;
            break;
        };
        if (!any) {
            if (stats) |out| out.* = .{};
            return allocator.alloc(@import("../../model/created_cell_properties_projection.zig").Style, 0);
        }
        const owned = if (state.chart_resources.docinfo == null) try state.source.decodeDocInfo(allocator, max_stream) else null;
        defer if (owned) |bytes| allocator.free(bytes);
        const info = state.chart_resources.docinfo orelse owned.?;
        var prepared = try @import("created_cell_properties_resources.zig").prepare(allocator, info, state.created_tables, state.source.header.version(), max_stream);
        defer prepared.deinit(allocator);
        var resources = try @import("cell_background_write.zig").resourceIndex(allocator, prepared.bytes, state.source.header.version(), max_stream);
        defer resources.deinit(allocator);
        var memo = @import("../../model/created_cell_properties_projection.zig").Memo.init(allocator);
        defer memo.deinit();
        memo.stats.document_prepares = 1;
        var rows: std.ArrayList(@import("../../model/created_cell_properties_projection.zig").Style) = .empty;
        errdefer {
            for (rows.items) |row| allocator.free(row.identity);
            rows.deinit(allocator);
        }
        const empty: [40]u8 = @splat(0);
        for (prepared.tables, 0..) |values, section| for (values.entries) |entry| {
            const table = &entry.value.table;
            for (table.cells, 0..) |_, i| {
                const row: u32 = @intCast(i / table.plan.columns);
                const column: u32 = @intCast(i % table.plan.columns);
                const id = try table.cellBorderFill(row, column);
                const resolved = memo.get(id) orelse resolved: {
                    const payload = if (id == 0) &empty else (try resources.resource(std.math.cast(u16, id) orelse return error.InvalidBorderFillReference)).payload;
                    const source = try @import("../docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(payload, .observed_absent);
                    const supported = source.attributes & ~@as(u16, @import("../../model/table_diagonal_values.zig").hwp5_direction_mask) == 0;
                    break :resolved try memo.resolve(id, try @import("border_fill_payload_patch.zig").observe(payload), payload, supported, if (id == 0) .owned_absent_profile else .save_materialized_resource);
                };
                try @import("../../model/created_cell_properties_projection.zig").append(allocator, &rows, &memo, @intCast(section), table.identity, row, column, resolved);
            }
        };
        const result = try rows.toOwnedSlice(allocator);
        if (stats) |out| out.* = memo.stats;
        return result;
    }

    pub fn documentTextAnchor(self: *const Session, allocator: std.mem.Allocator, binding: @import("../../model/formatting_binding.zig").State, revision: ?u32, request: @import("../../model/document_text_anchor.zig").Request) !@import("../../model/document_text_anchor.zig").Response {
        var snapshot = try self.documentTextSnapshot(allocator, binding, revision);
        defer snapshot.deinit();
        if (request.read_stamp) |stamp| try snapshot.bindReadStamp(stamp);
        const state = self.stateConst();
        return @import("document_text_anchor.zig").query(allocator, &state.document, state.created_tables, &snapshot, request);
    }

    pub fn documentTextSelection(self: *const Session, allocator: std.mem.Allocator, binding: @import("../../model/formatting_binding.zig").State, revision: ?u32, request: @import("../../model/document_text_selection.zig").Request) !@import("../../model/document_text_selection.zig").Response {
        var snapshot = try self.documentTextSnapshot(allocator, binding, revision);
        defer snapshot.deinit();
        if (request.read_stamp) |stamp| try snapshot.bindReadStamp(stamp);
        const state = self.stateConst();
        return @import("document_text_selection.zig").query(allocator, &state.document, state.created_tables, &snapshot, request);
    }

    pub fn documentTextSnapshot(self: *const Session, allocator: std.mem.Allocator, binding: @import("../../model/formatting_binding.zig").State, revision: ?u32) !@import("../../model/document_text_snapshot.zig").Snapshot {
        try self.materializeLiveText();
        const state = self.stateConst();
        const coverage = try self.independentTextCoverage(allocator);
        defer allocator.free(coverage.sections);
        return @import("document_text_snapshot.zig").read(allocator, &state.document, state.created_tables, state.decoded, state.source.header.version(), binding, revision, coverage);
    }
    pub fn prepareDocumentTextPlan(self: *const Session, allocator: std.mem.Allocator, input: @import("../../model/document_replace_all.zig").Plan) !@import("document_text_plan.zig").Plan {
        try self.materializeLiveText();
        return @import("document_text_plan.zig").prepare(allocator, &self.stateConst().document, input);
    }
    pub fn currentTextPreview(self: *const Session, allocator: std.mem.Allocator) ![]u8 {
        try self.materializeLiveText();
        return @import("current_text_preview.zig").encode(allocator, &self.stateConst().document, self.fileVersion());
    }

    pub fn copyCreatedCellUtf8(self: *const Session, a: std.mem.Allocator, point: @import("created_cell_text.zig").Point) ![]u8 {
        try self.materializeLiveText();
        return @import("created_cell_text.zig").copyUtf8(a, self.stateConst().created_tables, point);
    }

    /// Read-only current view; does not change the existing paragraph ordinal ABI.
    pub fn currentSourceParagraphReference(self: *const Session, section: usize, index: usize) !@import("created_table_paragraphs.zig").Reference {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const paragraphs = state.document.sections[section].paragraphs;
        if (index >= paragraphs.len) return error.InvalidParagraph;
        return .{ .source = .{ .section = section, .host = try @import("created_table_anchor.zig").identity(paragraphs[index]) } };
    }

    /// Full logical order, including cells of staged generated tables.
    pub fn currentParagraphReferences(self: *const Session, a: std.mem.Allocator, section: usize, limit: usize) ![]@import("created_table_paragraphs.zig").Reference {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("created_table_paragraphs.zig").build(a, state.decoded[section], &state.document.sections[section], &state.created_tables[section], state.source.header.version(), section, limit);
    }

    pub fn copyCurrentParagraphTextUtf16(self: *const Session, a: std.mem.Allocator, section: usize, reference: @import("created_table_paragraphs.zig").Reference) ![]u8 {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return switch (reference) {
            .source => |reference_source| block: {
                if (reference_source.section != section) return error.SourceBindingMismatch;
                break :block self.copyText(a, section, try @import("created_table_anchor.zig").resolve(a, &state.document.sections[section], .{ .host = reference_source.host, .unit = 0 }));
            },
            .created_cell => |point| block: {
                if (point.section != section) return error.SourceBindingMismatch;
                const utf8 = try self.copyCreatedCellUtf8(a, point);
                defer a.free(utf8);
                const units = std.unicode.calcUtf16LeLen(utf8) catch return error.InvalidTableCellText;
                const byte_count = std.math.mul(usize, units, 2) catch return error.LimitExceeded;
                const length = std.math.add(usize, byte_count, 2) catch return error.LimitExceeded;
                if (length > max_stream) return error.LimitExceeded;
                const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, utf8);
                defer a.free(utf16);
                const bytes = try a.alloc(u8, length);
                @memcpy(bytes[0 .. length - 2], std.mem.sliceAsBytes(utf16));
                std.mem.writeInt(u16, bytes[length - 2 ..][0..2], 13, .little);
                break :block bytes;
            },
        };
    }
    /// Checkpoint must represent the current model; history reserves first.
    pub fn applyCheckpointed(self: *Session, checkpoint: *Checkpoint, limit: usize, command: Command) !bool {
        if (command == .set_cell_vertical_alignment_block or command == .set_cell_insets) try self.requireManagedCellBlock();
        try self.requireManagedAnchoredDispatch(command);
        try self.materializeLiveText();
        return self.applyBatchCheckpointed(checkpoint, limit, &.{command});
    }

    pub fn applyBatchCheckpointed(self: *Session, checkpoint: *Checkpoint, limit: usize, commands: []const Command) !bool {
        for (commands) |command| if (command == .set_cell_insets and commands.len != 1) return error.HistoryProtocol2Required;
        for (commands) |command| if (command == .set_cell_vertical_alignment_block or command == .set_cell_insets) try self.requireManagedCellBlock();
        for (commands) |command| try self.requireManagedAnchoredDispatch(command);
        try self.materializeLiveText();
        const before = try self.externalHistoryBegin();
        const result = self.applyBatchCheckpointedBody(checkpoint, limit, commands) catch |err| {
            try self.externalHistoryEnd(before, err);
            return err;
        };
        try self.externalHistoryEnd(before, null);
        return result;
    }
    fn applyBatchCheckpointedBody(self: *Session, checkpoint: *Checkpoint, limit: usize, commands: []const Command) !bool {
        if (!try self.matchesCheckpoint(checkpoint)) return error.SourceBindingMismatch;
        var font_cache: @import("../../model/batch_font_lookup.zig").Cache = .{};
        for (commands) |command| self.applyWithFontCache(command, &font_cache) catch |err| {
            const state = self.getState();
            try @import("table_checkpoint.zig").rollbackWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
            state.refreshSourceViews();
            return err;
        };
        self.finishFormattingBatch() catch |err| {
            const state = self.getState();
            try @import("table_checkpoint.zig").rollbackWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
            state.refreshSourceViews();
            return err;
        };
        if (try self.matchesCheckpoint(checkpoint)) return false;
        _ = self.checkpointSize(limit) catch |err| {
            const state = self.getState();
            try @import("table_checkpoint.zig").rollbackWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
            state.refreshSourceViews();
            return err;
        };
        return true;
    }

    pub fn matchesCheckpoint(self: *const Session, checkpoint: *const Checkpoint) !bool {
        try self.materializeLiveText();
        const state = self.stateConst();
        return @import("table_checkpoint.zig").matchesWithCharts(checkpoint, state.allocator, self, &state.document, state.created_tables, state.cell_backgrounds, state.chart_resources);
    }

    pub fn checkpointSize(self: *const Session, limit: usize) !usize {
        try self.materializeLiveText();
        return @import("table_checkpoint.zig").sizeWithCharts(&self.stateConst().document, self.stateConst().created_tables, self.stateConst().cell_backgrounds, self.stateConst().chart_resources, limit);
    }

    pub fn createCheckpoint(self: *const Session, max_checkpoint_bytes: usize) !*Checkpoint {
        try self.materializeLiveText();
        const state = self.stateConst();
        return @import("table_checkpoint.zig").captureWithCharts(state.allocator, self, &state.document, state.created_tables, state.cell_backgrounds, state.chart_resources, max_checkpoint_bytes);
    }

    /// V2 history storage only. The returned values may not be exchanged into live state.
    pub fn createHistoryCheckpointIn(self: *const Session, storage: std.mem.Allocator, limit: usize) !*Checkpoint {
        try self.materializeLiveText();
        const state = self.stateConst();
        return @import("table_checkpoint.zig").captureWithCharts(storage, self, &state.document, state.created_tables, state.cell_backgrounds, state.chart_resources, limit);
    }
    pub fn cloneHistoryCheckpointForRestore(self: *const Session, checkpoint: *const Checkpoint, limit: usize) !*Checkpoint {
        try self.materializeLiveText();
        return @import("table_checkpoint.zig").cloneTo(checkpoint, self.stateConst().allocator, self, limit);
    }
    /// active 거래의 rollback 입력은 소비용 checkpoint다. 성공 후 호출자는 즉시 deinit한다.
    /// 외부 restore/exchange는 교체되는 현재값 보존을 위해 아래 일반 경로를 사용한다.
    pub fn rollbackHistoryCheckpoint(self: *Session, checkpoint: *Checkpoint) !void {
        if (self.historyTransactionActive()) {
            try self.rollbackHistoryCheckpointDiscardingLive(checkpoint);
            return;
        }
        try self.materializeLiveText();
        const before = try self.externalHistoryBegin();
        self.rollbackHistoryCheckpointBody(checkpoint) catch |err| {
            try self.externalHistoryEnd(before, err);
            return err;
        };
        try self.externalHistoryEnd(before, null);
    }
    fn rollbackHistoryCheckpointDiscardingLive(self: *Session, checkpoint: *Checkpoint) !void {
        const state = self.getState();
        const barrier = state.history_epoch orelse return error.MutationInProgress;
        if (!barrier.active) return error.MutationInProgress;
        if (barrier.poisoned) return error.HistoryMutationUncertain;
        // 이 함수는 bind/목적지 size 검증을 모두 끝낸 뒤에만 swap한다. 실패 전 gap 폐기 금지.
        // 현재 canonical tokens는 이때 checkpoint로 이동하며 즉시 deinit될 소비값이다.
        try @import("table_checkpoint.zig").rollbackWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
        state.refreshSourceViews();
        // checkpoint 검증/교환 성공 이후에는 오류·할당·model 역참조가 없다.
        if (state.live_text) |*backing| {
            inline for (@typeInfo(@TypeOf(state.live_totals)).@"struct".field_names) |field_name| {
                @field(state.live_totals, field_name) += @field(backing.counters, field_name);
            }
            backing.deinit();
            state.live_text = null;
            // 포화 시 새 gap 생성을 거부한다. rollback 자체는 overflow/할당으로 실패하지 않는다.
            state.live_incarnation +|= 1;
        }
    }
    fn rollbackHistoryCheckpointBody(self: *Session, checkpoint: *Checkpoint) !void {
        try self.materializeLiveText();
        const state = self.getState();
        try @import("table_checkpoint.zig").rollbackWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
        state.refreshSourceViews();
    }

    pub fn restoreCheckpoint(self: *Session, checkpoint: *Checkpoint) !void {
        self.invalidateStrictLayout();
        try self.materializeLiveText();
        const before = try self.externalHistoryBegin();
        self.restoreCheckpointBody(checkpoint) catch |err| {
            try self.externalHistoryEnd(before, err);
            return err;
        };
        try self.externalHistoryEnd(before, null);
    }
    fn restoreCheckpointBody(self: *Session, checkpoint: *Checkpoint) !void {
        try self.materializeLiveText();
        const state = self.getState();
        try @import("table_checkpoint.zig").exchangeWithCharts(checkpoint, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources);
        state.refreshSourceViews();
    }

    pub fn open(a: std.mem.Allocator, input: []const u8) !*Session {
        return openMode(a, input, false, false);
    }

    pub fn openDistribution(a: std.mem.Allocator, input: []const u8) !*Session {
        return openMode(a, input, true, false);
    }

    pub fn openRetainingObservedDocInfo(a: std.mem.Allocator, input: []const u8) !*Session {
        return openMode(a, input, false, true);
    }

    pub fn observedDocInfoDiagnostics(self: *const Session) ?@import("observed_docinfo.zig").Diagnostics {
        return self.stateConst().observed_docinfo;
    }

    fn openMode(a: std.mem.Allocator, input: []const u8, distribution: bool, retain_observed_docinfo: bool) !*Session {
        var source = if (distribution) try Source.openReadOnly(a, input) else try Source.open(a, input);
        errdefer source.deinit();
        if (distribution) {
            if (!source.header.has(.distribution)) return error.NotDistributionDocument;
            if (!source.header.has(.compressed)) return error.UnsupportedDistributionCompression;
            if (source.header.has(.history) or source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedDistributionSaveFeatures;
        }
        // Reader repairs are useful for preview, but not an implicit save policy.
        if (!std.mem.eql(u8, input, source.file.bytes)) return error.RepairedSourceUnsupported;
        const info = try source.decodeDocInfo(a, max_stream);
        defer a.free(info);
        var observed: ?@import("observed_docinfo.zig").Diagnostics = null;
        const resources = if (retain_observed_docinfo) retained: {
            const inspected = try @import("observed_docinfo.zig").inspect(info, source.header.version());
            observed = inspected.diagnostics;
            break :retained inspected.report;
        } else try @import("../docinfo/resources.zig").inspect(info, source.header.version(), .{});
        if (!retain_observed_docinfo) try resources.validateKnownCounts();
        const style_count = resources.count(.style);

        const decoded = try a.alloc([]u8, source.section_count);
        errdefer a.free(decoded);
        var decoded_count: usize = 0;
        errdefer for (decoded[0..decoded_count]) |bytes| a.free(bytes);
        var remaining: usize = max_bytes;
        for (decoded, 0..) |*bytes, index| {
            bytes.* = try source.decodeSection(a, index);
            decoded_count += 1;
            if (bytes.len > remaining) return error.LimitExceeded;
            remaining -= bytes.len;
        }
        var document = try projection.fromDecodedSections(a, source.header.version(), decoded);
        errdefer document.deinit(a);
        const offsets = try a.alloc([]usize, decoded.len);
        errdefer a.free(offsets);
        var offset_count: usize = 0;
        errdefer for (offsets[0..offset_count]) |values| a.free(values);
        for (decoded, document.sections, offsets) |bytes, section, *values| {
            values.* = try a.alloc(usize, section.paragraphs.len);
            offset_count += 1;
            var it = framing.Iterator.init(bytes, .{});
            var node: usize = 0;
            var paragraph_index: usize = 0;
            while (try it.next()) |record| : (node += 1) {
                if (record.tag != @backingInt(Tag.paragraph_header)) continue;
                if (paragraph_index >= section.paragraphs.len) return error.SourceBindingMismatch;
                const p = section.paragraphs[paragraph_index];
                if (try p.originalNode() != node) return error.SourceBindingMismatch;
                if (p.style_id >= style_count) return error.InvalidStyleReference;
                const parsed = try Header.parse(record.payload, source.header.version());
                if (parsed.style_id != p.style_id) return error.SourceBindingMismatch;
                values.*[paragraph_index] = record.offset + (record.raw.len - record.payload.len) + Header.style_id_offset;
                paragraph_index += 1;
            }
            if (paragraph_index != section.paragraphs.len) return error.SourceBindingMismatch;
        }
        const created_tables = try a.alloc(@import("created_table_values.zig").Values, document.sections.len);
        errdefer a.free(created_tables);
        for (created_tables) |*tables| tables.* = .{};
        const decoded_views = try a.dupe([]u8, decoded);
        errdefer a.free(decoded_views);
        const offset_views = try a.dupe([]usize, offsets);
        errdefer a.free(offset_views);
        const owned = try a.create(State);
        owned.* = .{ .allocator = a, .source = source, .original_decoded = decoded, .decoded = decoded_views, .document = document, .created_tables = created_tables, .original_style_offsets = offsets, .style_offsets = offset_views, .style_count = style_count, .char_count = resources.count(.char_shape), .para_count = resources.count(.para_shape), .border_count = resources.count(.border_fill), .memo_shape_count = resources.memo_shape_count };
        owned.observed_docinfo = observed;
        return @ptrCast(owned);
    }

    pub fn close(self: *Session) void {
        const state = self.getState();
        if (state.history_epoch) |*barrier| barrier.close();
        const a = state.allocator;
        state.deinit();
        a.destroy(state);
    }

    pub fn sectionCount(self: *const Session) usize {
        return self.stateConst().document.sections.len;
    }

    pub fn characterShapeCount(self: *const Session) usize {
        const state = self.stateConst();
        return state.char_count + if (state.formatting_batch) |context| context.characters.entries(&state.document).len else state.document.character_resources.len;
    }
    pub fn paragraphShapeCount(self: *const Session) usize {
        return self.stateConst().para_count + self.stateConst().document.paragraph_resources.len;
    }
    pub fn ensureFont(self: *Session, language: @import("../../model/character_fonts.zig").Language, name: []const u8) !u32 {
        try self.materializeLiveText();
        const before = try self.externalHistoryBegin();
        const result = self.ensureFontBody(language, name) catch |err| {
            try self.externalHistoryEnd(before, err);
            return err;
        };
        try self.externalHistoryEnd(before, null);
        return result;
    }
    fn ensureFontBody(self: *Session, language: @import("../../model/character_fonts.zig").Language, name: []const u8) !u32 {
        const state = self.getState();
        const a = state.allocator;
        try @import("../../model/font_name.zig").validate(name, 4096);
        const faces = try self.fontFaces(a);
        defer {
            for (faces) |*face| face.deinit(a);
            a.free(faces);
        }
        var count: u32 = 0;
        for (faces) |face| if (face.language == language) {
            if (face.name) |existing| if (std.mem.eql(u8, existing, name)) return face.id;
            count += 1;
        };
        if (count > std.math.maxInt(u16)) return error.InvalidFontId;
        var pending = try state.document.font_resources.clone(a);
        defer pending.deinit(a);
        _ = try pending.add(a, language, count, name, 4096);
        var candidate = self.formattingDocument();
        candidate.font_resources = pending;
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const verified = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &candidate, state.para_count, state.char_count, max_stream);
        defer a.free(verified);
        std.mem.swap(@import("../../model/font_resource_values.zig").Values, &state.document.font_resources, &pending);
        return count;
    }
    pub fn pageRestartInventory(self: *const Session, a: std.mem.Allocator, section: usize, revision: u32) ![]@import("page_restart_inventory.zig").Candidate {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("page_restart_inventory.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs, section, try self.historyTicket(), revision, read_only);
    }
    pub fn pageRestart(self: *const Session, a: std.mem.Allocator, section: usize, control: usize, revision: u32) !@import("page_restart_history.zig").Observation {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("page_restart_history.zig").observe(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs, section, control, try self.historyTicket(), revision, read_only);
    }
    pub fn validatePageRestart(self: *const Session, request: @import("page_restart_history.zig").Request, revision: u32) !bool {
        if (!std.meta.eql(request.before.ticket, try self.historyTicket()) or request.before.revision != revision) return error.StalePageRestartBinding;
        const state = self.stateConst();
        const index = request.before.target.section;
        if (index >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        const current = try @import("page_restart_history.zig").observe(state.allocator, state.decoded[index], state.source.header.version(), state.document.sections[index].paragraphs, index, request.before.target.control_node, try self.historyTicket(), revision, read_only);
        return @import("page_restart_history.zig").validate(request.before, current, request.number);
    }
    pub fn paragraphShapeId(self: *const Session, section: usize, paragraph_index: usize) !u16 {
        try self.materializeLiveText();
        if (paragraph_index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        return self.stateConst().document.sections[section].paragraphs[paragraph_index].para_shape_id;
    }
    /// Owned immutable batch witness; managed history remains the only publisher.
    pub fn cellVerticalAlignmentBlock(self: *const Session, a: std.mem.Allocator, witness: @import("cell_vertical_alignment_batch_plan.zig").Witness) !@import("cell_vertical_alignment_batch_plan.zig").Observation {
        const state = self.stateConst();
        if (witness.section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("cell_vertical_alignment_batch_plan.zig").observe(a, state.decoded[witness.section], state.source.header.version(), state.document.sections[witness.section], witness.section, witness, try self.historyTicket(), read_only);
    }
    pub fn validateCellVerticalAlignmentBlock(self: *const Session, request: @import("cell_vertical_alignment_batch_plan.zig").Request) !bool {
        const state = self.stateConst();
        const index = request.before.section;
        if (index >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("cell_vertical_alignment_batch_plan.zig").validate(state.allocator, state.decoded[index], state.source.header.version(), state.document.sections[index], index, request.before, request.value, try self.historyTicket(), read_only);
    }
    fn requireManagedCellBlock(self: *const Session) !void {
        if (!self.historyTransactionActive() or self.stateConst().history_poison_observer == null) return error.HistoryProtocol2Required;
    }
    pub fn cellInsets(self: *const Session, a: std.mem.Allocator, selector: @import("cell_insets_plan.zig").Selector) !@import("cell_insets_plan.zig").Observation {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("cell_insets_plan.zig").observe(a, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section], selector.section, selector, try self.historyTicket(), read_only);
    }
    pub fn validateCellInsets(self: *const Session, request: @import("cell_insets_plan.zig").Request) !bool {
        try self.materializeLiveText();
        const state = self.stateConst();
        const index = request.before.selector.section;
        if (index >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("cell_insets_plan.zig").validate(state.allocator, state.decoded[index], state.source.header.version(), state.document.sections[index], index, request, try self.historyTicket(), read_only);
    }
    pub fn cellVerticalAlignment(self: *const Session, a: std.mem.Allocator, selector: @import("cell_vertical_alignment_plan.zig").Selector) !@import("cell_vertical_alignment_plan.zig").Observation {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("cell_vertical_alignment_plan.zig").observe(a, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section], selector.section, selector, try self.historyTicket(), read_only);
    }
    pub fn tableBindings(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_display_bindings.zig").Binding {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const bindings = try @import("table_display_bindings.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
        if (state.document.sections[section].table_cell_sizes) |sizes| {
            for (bindings) |*binding| for (sizes) |size| {
                if (binding.list_node == size.source_list_node) {
                    binding.width = size.width;
                    binding.height = size.height;
                    break;
                }
            };
        }
        return bindings;
    }
    pub fn tablePlacements(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_display_placements.zig").Placement {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_display_placements.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn tableLayoutSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_layout_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_layout_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn captionSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("caption_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("caption_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn equationSites(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("equation_sources.zig").Site {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("equation_sources.zig").sites(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs, .{});
    }
    pub fn observeEquationScriptEdit(self: *const Session, a: std.mem.Allocator, selector: @import("equation_script_edit.zig").Selector) !@import("equation_script_edit.zig").Witness {
        try self.materializeLiveText();
        if (self.historyTransactionActive()) return error.MutationInProgress;
        const state = self.stateConst();
        if (state.formatting_batch != null) return error.MutationInProgress;
        if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedEquationSaveFeatures;
        return @import("equation_script_edit.zig").observe(a, state.decoded, &state.document, state.source.header.version(), selector, try self.historyTicket());
    }
    pub const EquationScriptEditCapture = struct {
        before: @import("equation_script_edit.zig").Witness,
        script_units: []u16,
        pub fn deinit(self: *EquationScriptEditCapture, allocator: std.mem.Allocator) void {
            allocator.free(self.script_units);
            self.* = undefined;
        }
    };
    /// One explicit owner observation. Inventory/render paths never call this.
    pub fn captureEquationScriptEdit(self: *const Session, allocator: std.mem.Allocator, selector: @import("equation_script_edit.zig").Selector) !EquationScriptEditCapture {
        const before = try self.observeEquationScriptEdit(allocator, selector);
        const state = self.stateConst();
        const source = try @import("equation_sources.zig").readSelected(allocator, state.decoded[selector.section], state.source.header.version(), selector.equation_node, selector.layout, .{});
        if (source.script.len % 2 != 0 or source.script.len / 2 > 65535) return error.InvalidEquationScriptEncoding;
        const units = try allocator.alloc(u16, source.script.len / 2);
        for (units, 0..) |*unit, i| unit.* = std.mem.readInt(u16, source.script[i * 2 ..][0..2], .little);
        return .{ .before = before, .script_units = units };
    }
    pub fn equationSnapshot(self: *const Session, a: std.mem.Allocator, section: usize, layout: @import("../body/equation.zig").Layout) ![]u8 {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("equation_snapshot.zig").encode(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs, layout);
    }
    pub fn formSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("form_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("form_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formProperties(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("form_property_snapshot.zig").Row {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        if (state.document.sections[section].form_values) |values| {
            const current = try @import("form_current_section.zig").writeAll(a, state.decoded[section], state.source.header.version(), values, max_stream);
            defer a.free(current);
            return @import("form_property_snapshot.zig").read(a, current, state.source.header.version());
        }
        return @import("form_property_snapshot.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("form_anchor_positions.zig").Anchor {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("form_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    /// Native-only physical target. Existing public geometry and image APIs are unchanged.
    pub fn objectOuterMargins(self: *const Session, selector: @import("object_outer_margins.zig").Selector) !@import("object_outer_margins.zig").Observation {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const ticket = try self.historyTicket();
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("object_outer_margins.zig").read(state.allocator, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section], selector, ticket, read_only);
    }
    pub fn objectVerticalOuterMargins(self: *const Session, selector: @import("object_outer_margins.zig").Selector) !@import("object_outer_margins.zig").Observation {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const ticket = try self.historyTicket();
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("object_outer_margins.zig").readObservedVertical(state.allocator, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section], selector, ticket, read_only);
    }
    /// Caller transfers bytes/optional intent ownership only after this succeeds.
    /// The source topology, record offsets and all unrelated live model intents stay fixed.
    fn publishFixedSection(self: *Session, index: usize, bytes: []u8, sizes: union(enum) { keep, replace: ?[]model.PictureCurrentSize }) !void {
        const state = self.getState();
        if (bytes.len != state.decoded[index].len) return error.SourceBindingMismatch;
        const offsets = try state.allocator.dupe(usize, state.style_offsets[index]);
        const section = &state.document.sections[index];
        var old = section.rebased_source;
        const old_sizes = section.picture_current_sizes;
        section.rebased_source = .{ .bytes = bytes, .style_offsets = offsets, .original_record_count = if (old) |basis| basis.original_record_count else section.source_record_count };
        switch (sizes) {
            .keep => {},
            .replace => |values| section.picture_current_sizes = values,
        }
        state.refreshSourceViews();
        if (old) |*basis| basis.deinit(state.allocator);
        if (sizes == .replace) if (old_sizes) |values| state.allocator.free(values);
    }
    pub fn anchoredPictureGeometry(self: *const Session, selector: @import("object_outer_margins.zig").Selector) !@import("picture_anchored_resize.zig").Observation {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const ticket = try self.historyTicket();
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        return @import("picture_anchored_resize.zig").observe(state.allocator, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section], selector, ticket, read_only);
    }
    pub fn objectGeometry(self: *const Session, a: std.mem.Allocator, selector: @import("../../model/object_geometry.zig").Selector, revision: u64, binding: @import("../../model/object_geometry.zig").Binding) !@import("../../model/object_geometry.zig").Observation {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (selector.section >= state.document.sections.len) return error.InvalidSection;
        const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
        if (selector.kind == .chart) {
            const current = try self.currentDrawingSection(a, selector.section);
            defer if (current) |bytes| a.free(bytes);
            return @import("chart_object_geometry.zig").observe(a, self, &state.source, !state.chart_resources.empty(), current orelse state.decoded[selector.section], state.decoded, state.source.header.version(), state.document.sections[selector.section], selector, revision, binding, read_only);
        }
        return @import("object_geometry.zig").observe(a, state.decoded[selector.section], state.source.header.version(), state.document.sections[selector.section].paragraphs, selector, revision, binding, read_only);
    }
    pub fn drawingSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        if (state.document.sections[section].picture_current_sizes) |sizes| {
            const current = try @import("picture_current_size_section.zig").writeAll(a, state.decoded[section], state.source.header.version(), sizes, max_stream);
            defer a.free(current);
            return @import("drawing_sources.zig").read(a, current, state.source.header.version());
        }
        return @import("drawing_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn drawingObjectExtras(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_object_extras.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_object_extras.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formulaSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("formula_snapshot.zig").Row {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("formula_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    pub fn fieldSpans(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("field_span_snapshot.zig").Row {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("field_span_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    /// Marker diagnostics only, not field-header binding or edit admission.
    pub fn namedFields(self: *const Session, a: std.mem.Allocator) ![]u8 {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        const state = self.stateConst();
        if (state.source.header.has(.distribution)) return error.NamedFieldsUnavailable;
        // The live gap owns only control-free paragraphs and cannot contain a field.
        return @import("named_fields.zig").encode(a, state.decoded, state.source.header.version(), &state.document);
    }
    pub fn fieldTopology(self: *const Session, a: std.mem.Allocator, section: usize) !@import("local_field_spans.zig").Report {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("local_field_spans.zig").inspectReadableBound(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    pub fn drawingComponentSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_component_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        if (state.document.sections[section].picture_current_sizes) |sizes| {
            const current = try @import("picture_current_size_section.zig").writeAll(a, state.decoded[section], state.source.header.version(), sizes, max_stream);
            defer a.free(current);
            return @import("drawing_component_sources.zig").read(a, current, state.source.header.version());
        }
        return @import("drawing_component_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn drawingAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_anchor_positions.zig").Anchor {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn drawingListSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_list_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_list_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn drawingMatrixSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_matrix_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_matrix_sources.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingLocalTransforms(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_local_transforms.zig").Transform {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_local_transforms.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingRectangleCorners(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_rectangle_corners.zig").Corners {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_rectangle_corners.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingPolygonPoints(self: *const Session, a: std.mem.Allocator, section: usize, layout: @import("../body/shape_polygon.zig").Layout) ![]@import("drawing_polygon_points.zig").Polygon {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_polygon_points.zig").read(a, current orelse state.decoded[section], state.source.header.version(), layout);
    }
    pub fn drawingCurvePoints(self: *const Session, a: std.mem.Allocator, section: usize, layout: @import("../body/shape_curve.zig").Layout) ![]@import("drawing_curve_points.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_curve_points.zig").read(a, current orelse state.decoded[section], state.source.header.version(), layout);
    }
    pub fn drawingLineEndpoints(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_line_endpoints.zig").Endpoints {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_line_endpoints.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    /// Owned, per-object observations. One DocInfo/name/resource index for all sections.
    pub fn hwp5ChartCandidates(self: *const Session, a: std.mem.Allocator) ![]@import("../chart/candidate_snapshot.zig").Candidate {
        return self.hwp5ChartCandidatesSelected(a, .structural);
    }
    pub fn hwp5ChartCandidatesWithLayout(self: *const Session, a: std.mem.Allocator, layout: @import("../body/ole.zig").Layout) ![]@import("../chart/candidate_snapshot.zig").Candidate {
        return self.hwp5ChartCandidatesSelected(a, .{ .explicit = layout });
    }
    fn hwp5ChartCandidatesSelected(self: *const Session, a: std.mem.Allocator, selection: @import("../body/ole.zig").Selection) ![]@import("../chart/candidate_snapshot.zig").Candidate {
        try self.materializeLiveText();
        const state = self.stateConst();
        var resource_source = try @import("../chart/created_resource_read.zig").prepare(a, self, !state.chart_resources.empty());
        defer resource_source.deinit(a);
        var index = try @import("binary_resource_index.zig").Index.init(a, resource_source.get(&state.source));
        defer index.deinit(a);
        var batch: @import("../chart/candidate_snapshot.zig").Batch = .{ .index = &index };
        defer batch.deinit(a);
        var rows: std.ArrayList(@import("../chart/candidate_snapshot.zig").Candidate) = .empty;
        errdefer rows.deinit(a);
        for (state.document.sections, 0..) |part, section| {
            const current = try self.currentDrawingSection(a, section);
            defer if (current) |bytes| a.free(bytes);
            const observations = try @import("../chart/ole_sites.zig").observeSelected(a, current orelse state.decoded[section], state.source.header.version(), part.paragraphs, selection);
            defer a.free(observations);
            try batch.append(a, &rows, @intCast(section), observations);
        }
        return rows.toOwnedSlice(a);
    }
    pub fn hwp5ChartDisplay(self: *const Session, a: std.mem.Allocator, section: usize, control: usize) !@import("../chart/display_snapshot.zig").Snapshot {
        return self.hwp5ChartDisplaySelected(a, section, control, .structural);
    }
    /// Capture editability through the same native admission used by preview/apply.
    /// Does not infer a History ticket from a display revision or return PNG authority.
    pub fn hwp5ChartLiteralEditLease(self: *const Session, a: std.mem.Allocator, section: usize, control: usize) !@import("../chart/literal_edit_lease.zig").Lease {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        const rows = try self.hwp5ChartCandidates(a);
        defer a.free(rows);
        var selected: ?@import("../chart/literal_edit_request.zig").Target = null;
        for (rows) |row| {
            if (row.section != section or row.owner.control_node != control) continue;
            if (selected != null) return error.SourceBindingMismatch;
            if (row.resource.state != .modern_chart) return error.UnsupportedChartLiteralEditProfile;
            selected = .{ .section = section, .owner = row.owner, .physical_id = row.resource.physical_id orelse return error.SourceBindingMismatch, .resource_sha256 = row.resource.resource_sha256 orelse return error.SourceBindingMismatch };
        }
        const target = selected orelse return error.SourceBindingMismatch;
        const resource = try self.binaryResource(a, target.owner.ordinal, max_stream);
        defer a.free(resource);
        var input = try @import("../chart/literal_edit_resource.zig").open(a, resource, target.resource_sha256, max_stream);
        defer input.deinit();
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(input.xml(), &hash, .{});
        var current = try @import("../chart/literal_edit_xml.zig").prepare(a, input.xml(), hash, &.{}, max_stream);
        defer current.deinit(a);
        const expected = current.data.data.series[0].values[0];
        const noop: @import("../chart/literal_edit_request.zig").Edit = .{ .value = .{ .series = 0, .category = 0, .expected = expected, .value = expected } };
        const binding = try self.historyTicket();
        const context = try self.prepareChartLiteralEdit(a, .{ .profile = current.profile, .binding = binding, .owners = &.{target}, .source_xml_sha256 = hash, .edits = &.{noop} });
        return .{ .binding = binding, .target = target, .source_xml_sha256 = hash, .context = context };
    }
    /// ABI v1 uses an explicit output cap, independently of source XML/read retention.
    pub fn hwp5ChartLiteralEditPreviewBound(self: *const Session, a: std.mem.Allocator, plan: @import("../chart/literal_edit_request.zig").Plan, width: u32, height: u32, output_limit: usize) ![]u8 {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        var context = try self.prepareChartLiteralEdit(a, plan);
        defer context.deinit(a);
        if (context.input.width != width or context.input.height != height) return error.SourceBindingMismatch;
        return @import("../chart/literal_edit_preview.zig").write(a, &context.patch, width, height, output_limit);
    }
    /// Final ABI pre-apply check; Command admission repeats the full ticket/witness.
    pub fn validateHwp5ChartLiteralEditLease(self: *const Session, a: std.mem.Allocator, plan: @import("../chart/literal_edit_request.zig").Plan, width: u32, height: u32) !void {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        var context = try self.prepareChartLiteralEdit(a, plan);
        defer context.deinit(a);
        if (context.input.width != width or context.input.height != height) return error.SourceBindingMismatch;
    }
    /// Source-only Native v1. No optional ABI/capability is enabled by this declaration.
    pub fn hwp5ChartLiteralEditPreview(self: *const Session, a: std.mem.Allocator, plan: @import("../chart/literal_edit_request.zig").Plan) ![]u8 {
        if (self.historyTransactionActive()) return error.MutationInProgress;
        var prepared = try self.prepareChartLiteralEdit(a, plan);
        defer prepared.deinit(a);
        return @import("../chart/literal_edit_preview.zig").write(a, &prepared.patch, prepared.input.width, prepared.input.height, max_stream);
    }
    fn prepareChartLiteralEdit(self: *const Session, a: std.mem.Allocator, plan: @import("../chart/literal_edit_request.zig").Plan) !@import("../chart/literal_edit_context.zig").Prepared {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (state.formatting_batch != null) return error.MutationInProgress;
        inline for (.{ .distribution, .encrypted, .drm, .certificate_encryption, .certificate_drm, .history, .digital_signature, .signature_preview }) |flag| {
            if (state.source.header.has(flag)) return error.UnsupportedChartSaveFeatures;
        }
        try @import("../chart/literal_edit_request.zig").validate(plan);
        const ticket = try self.historyTicket();
        if (!std.meta.eql(plan.binding.binding, ticket.binding)) return error.SourceBindingMismatch;
        if (plan.binding.epoch != ticket.epoch) return error.StaleMutationEpoch;
        const observations = try self.hwp5ChartCandidates(a);
        defer a.free(observations);
        for (plan.owners) |target| {
            if (target.section >= state.document.sections.len) return error.InvalidSection;
            var matches: usize = 0;
            for (observations) |row| {
                if (row.section != target.section) continue;
                if (row.owner.geometry.instance_id == target.owner.geometry.instance_id and row.owner.control_node != target.owner.control_node) return error.UnsupportedChartLiteralEditAmbiguousOwner;
                if (row.owner.control_node != target.owner.control_node) continue;
                if (!std.meta.eql(row.owner, target.owner) or row.resource.state != .modern_chart or row.resource.physical_id == null or row.resource.resource_sha256 == null or row.resource.physical_id.? != target.physical_id or !std.mem.eql(u8, &row.resource.resource_sha256.?, &target.resource_sha256)) return error.SourceBindingMismatch;
                matches += 1;
            }
            if (matches != 1) return error.SourceBindingMismatch;
            const part = state.document.sections[target.section];
            if (target.owner.paragraph >= part.paragraphs.len or part.paragraphs[target.owner.paragraph].parent_node != null) return error.UnsupportedChartHost;
            var protection = try @import("text_source_protection.zig").read(a, state.decoded, state.source.header.version(), target.section, part);
            defer protection.deinit(a);
            if (target.owner.paragraph >= protection.protected_paragraphs.len or protection.protected_paragraphs[target.owner.paragraph]) return error.UnsupportedChartProtectedHost;
            const spans = try @import("local_field_spans.zig").collectReadableBound(a, state.decoded[target.section], state.source.header.version(), part);
            defer a.free(spans);
            for (spans) |span| {
                const paragraph_index = target.owner.paragraph;
                const unit = target.owner.current_unit;
                if (paragraph_index < span.begin.paragraph or paragraph_index > span.end.paragraph) continue;
                if ((paragraph_index != span.begin.paragraph or unit >= span.begin.unit) and (paragraph_index != span.end.paragraph or unit <= span.end.unit)) return error.UnsupportedChartFieldHost;
            }
        }
        const bytes = try self.binaryResource(a, plan.owners[0].owner.ordinal, max_stream);
        defer a.free(bytes);
        var input = try @import("../chart/literal_edit_resource.zig").open(a, bytes, plan.owners[0].resource_sha256, max_stream);
        errdefer input.deinit();
        var patch = try @import("../chart/literal_edit_xml.zig").prepare(a, input.xml(), plan.source_xml_sha256, plan.edits, max_stream);
        errdefer patch.deinit(a);
        if (patch.profile != plan.profile) return error.UnsupportedChartLiteralEditProfile;
        return .{ .input = input, .patch = patch };
    }
    pub fn hwp5ChartDisplayWithLayout(self: *const Session, a: std.mem.Allocator, section: usize, control: usize, layout: @import("../body/ole.zig").Layout) !@import("../chart/display_snapshot.zig").Snapshot {
        return self.hwp5ChartDisplaySelected(a, section, control, .{ .explicit = layout });
    }
    fn hwp5ChartDisplaySelected(self: *const Session, a: std.mem.Allocator, section: usize, control: usize, selection: @import("../body/ole.zig").Selection) !@import("../chart/display_snapshot.zig").Snapshot {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        const sites = try @import("../chart/ole_sites.zig").readSelectedForOwner(a, current orelse state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs, selection, control);
        defer a.free(sites);
        if (sites.len != 1) return error.SourceBindingMismatch;
        var resource_source = try @import("../chart/created_resource_read.zig").prepare(a, self, !state.chart_resources.empty());
        defer resource_source.deinit(a);
        var index = try @import("binary_resource_index.zig").Index.init(a, resource_source.get(&state.source));
        defer index.deinit(a);
        const bytes = try index.read(a, sites[0].ordinal, 32 * 1024 * 1024);
        defer a.free(bytes);
        var snapshot = try @import("../chart/display_snapshot.zig").read(a, @intCast(section), sites[0], bytes, .observed_size_prefix);
        errdefer snapshot.deinit(a);
        snapshot.physical_id = try index.physicalId(sites[0].ordinal);
        return snapshot;
    }
    fn currentDrawingSection(self: *const Session, a: std.mem.Allocator, section: usize) !?[]u8 {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const sizes = state.document.sections[section].picture_current_sizes orelse return null;
        return try @import("picture_current_size_section.zig").writeAll(a, state.decoded[section], state.source.header.version(), sizes, max_stream);
    }
    /// Owned rows and gradient arrays; release with drawing_style_sources.deinit.
    pub fn drawingStyleSources(self: *const Session, a: std.mem.Allocator, section: usize, options: @import("../body/drawing_style_validation.zig").Options) ![]@import("drawing_style_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_style_sources.zig").read(a, state.decoded[section], state.source.header.version(), options);
    }
    pub fn fileVersion(self: *const Session) u32 {
        return self.stateConst().source.header.version().raw;
    }
    pub fn pictureSources(self: *const Session, a: std.mem.Allocator, section: usize, prefix: @import("../body/shape_picture.zig").Prefix) ![]@import("picture_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("picture_sources.zig").read(a, state.decoded[section], state.source.header.version(), prefix);
    }
    pub fn pictureReplacementOwner(self: *const Session, a: std.mem.Allocator, section: u32, picture: u32, revision: u32, binding: @import("../../model/object_geometry.zig").Binding) !@import("../../model/picture_replacement.zig").Owner {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedPictureReplacementSaveFeatures;
        if (section >= state.document.sections.len) return error.InvalidSection;
        const raw = state.decoded[section];
        try @import("picture_replacement_current.zig").validateOwner(a, raw, state.source.header.version(), state.document.sections[section], picture);
        const ordinal = try @import("picture_replacement_current.zig").ordinal(a, raw, state.source.header.version(), picture);
        const resource = try self.binaryResource(a, ordinal, @import("../../model/picture_replacement.zig").max_image_bytes);
        defer a.free(resource);
        const identity = try std.fmt.allocPrint(a, "node:{d}", .{picture});
        errdefer a.free(identity);
        const link = try std.fmt.allocPrint(a, "{d}", .{ordinal});
        errdefer a.free(link);
        const session_binding = try a.dupe(u8, binding.session);
        errdefer a.free(session_binding);
        const serial_binding = try a.dupe(u8, binding.serial);
        return .{ .format = .hwp5, .section = section, .pictureNode = picture, .pictureIdentity = identity, .sourceSha256 = @import("../../model/picture_replacement.zig").hash(raw), .resourceSha256 = @import("../../model/picture_replacement.zig").hash(resource), .resourceLink = link, .historyRevision = revision, .binding = .{ .session = session_binding, .serial = serial_binding } };
    }
    /// Decoded internal resource bytes; caller frees them. Never resolves external paths.
    pub fn binaryResource(self: *const Session, a: std.mem.Allocator, ordinal: u16, limit: usize) ![]u8 {
        try self.materializeLiveText();
        if (try self.stateConst().chart_resources.read(a, ordinal, limit)) |bytes| return bytes;
        return @import("binary_resource.zig").read(a, &self.stateConst().source, ordinal, limit);
    }
    pub fn pictureTailSources(self: *const Session, a: std.mem.Allocator, section: usize, additional: ?@import("../body/picture_additional.zig").Layout) ![]@import("picture_tail_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("picture_tail_sources.zig").read(a, state.decoded[section], state.source.header.version(), additional);
    }
    pub fn cellLayoutSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("cell_layout_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const rows = try @import("cell_layout_sources.zig").read(a, state.decoded[section], state.source.header.version());
        errdefer a.free(rows);
        if (state.cell_backgrounds.hasSection(section)) {
            var prepared = try self.cellResources(a);
            defer prepared.deinit(a);
            for (rows) |*row| if (prepared.lookup(section, @intCast(row.table_record_node), @intCast(row.list_node))) |id| {
                row.border_fill_id = id;
            };
        }
        return rows;
    }
    pub fn tableAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_anchor_positions.zig").Anchor {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn structuralAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("structural_anchor_positions.zig").Anchor {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("structural_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn noteShapeSources(self: *const Session, a: std.mem.Allocator, section: usize) ![2]@import("note_shape_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("note_shape_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn noteSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("note_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("note_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn automaticNumberSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("automatic_number_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("automatic_number_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn pageControlSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("page_control_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_control_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn documentProperties(self: *const Session, a: std.mem.Allocator) !@import("document_properties_snapshot.zig").Snapshot {
        try self.materializeLiveText();
        const state = self.stateConst();
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        return @import("document_properties_snapshot.zig").read(decoded, state.source.header.version());
    }
    pub fn masterPageSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("master_page_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("master_page_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn pageAreaSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("page_area_sources.zig").Source {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_area_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn pageSettings(self: *const Session, a: std.mem.Allocator, section: usize) !@import("page_settings_snapshot.zig").Setting {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_settings_snapshot.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn sectionSettings(self: *const Session, a: std.mem.Allocator, section: usize) !@import("section_settings_snapshot.zig").Setting {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        var setting = try @import("section_settings_snapshot.zig").read(a, state.decoded[section], state.source.header.version());
        setting.memo_shape_count = state.memo_shape_count;
        return setting;
    }
    pub fn paragraphFlow(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("paragraph_flow_snapshot.zig").Flow {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("paragraph_flow_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    /// Caller releases the owned declaration array with column_sources_snapshot.free.
    pub fn columnSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("column_sources_snapshot.zig").Declaration {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const columns = @import("column_sources_snapshot.zig");
        const rows = try columns.read(a, state.decoded[section], state.source.header.version());
        errdefer columns.free(a, rows);
        const flows = try self.paragraphFlow(a, section);
        defer a.free(flows);
        try columns.bindCurrent(a, rows, flows);
        for (rows) |*row| {
            const p = state.document.sections[section].paragraphs[row.current_paragraph.?];
            row.current_unit = try @import("column_anchor_position.zig").read(p);
        }
        return rows;
    }
    pub fn characterRanges(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) ![]@import("character_display_ranges.zig").Range {
        try self.materializeLiveText();
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const state = self.stateConst();
        return @import("character_display_ranges.zig").read(a, state.document.sections[section].paragraphs[index], self.characterShapeCount());
    }

    pub const FormattingSource = struct {
        allocator: std.mem.Allocator,
        bytes: []u8,
        version: @import("../version.zig").Version,
        pub fn deinit(self: *FormattingSource) void {
            self.allocator.free(self.bytes);
            self.* = undefined;
        }
    };
    pub fn formattingSource(self: *const Session, a: std.mem.Allocator) !FormattingSource {
        const state = self.stateConst();
        var prepared = try self.cellResources(a);
        const bytes = prepared.bytes;
        prepared.bytes = &.{};
        prepared.deinit(a);
        return .{ .allocator = a, .bytes = bytes, .version = state.source.header.version() };
    }
    /// Readonly source-specific admission. No resource IDs or History are created.
    pub fn validateFormattingSource(self: *const Session, a: std.mem.Allocator, owner: @import("../../model/formatting_patch.zig").Owner, ranges: []const @import("../../model/formatting_patch.zig").Range, patch: @import("../../model/formatting_patch.zig").Patch, cached: ?*const FormattingSource) !void {
        if (patch.paragraph.bullet) |value| {
            try self.authorizeBullet(owner.section, owner.paragraph);
            var local: ?FormattingSource = null;
            defer if (local) |*v| v.deinit();
            const source = if (cached) |v| v else blk: {
                local = try self.formattingSource(a);
                break :blk &local.?;
            };
            const id = try self.paragraphShapeId(owner.section, owner.paragraph);
            _ = try @import("bullet_apply.zig").reference(a, source.bytes, source.version, id);
            if (value.id) |identity| try @import("bullet_apply.zig").eligible(a, source.bytes, source.version, identity);
        }
        if (patch.paragraph.spacing) |value| {
            const shapes = try self.paragraphShapes(a);
            defer a.free(shapes);
            const id = try self.paragraphShapeId(owner.section, owner.paragraph);
            if (id >= shapes.len) return error.InvalidParagraphShapeReference;
            if (value.kind == 3 and shapes[id].modern_spacing == null) return error.UnsupportedParagraphSpacing;
        }
        if (@import("../../model/paragraph_flags.zig").has(patch.paragraph.flags)) {
            var own: ?FormattingSource = null;
            defer if (own) |*value| value.deinit();
            const source = if (cached) |value| value else blk: {
                own = try self.formattingSource(a);
                break :blk &own.?;
            };
            const paragraph_id = try self.paragraphShapeId(owner.section, owner.paragraph);
            var it = try @import("../docinfo/reader.zig").Iterator.init(source.bytes, source.version, .{});
            var id: usize = 0;
            var found = false;
            while (try it.next()) |record| {
                if (record.value != .para_shape) continue;
                if (id == paragraph_id) {
                    const verified = try @import("paragraph_flags_payload.zig").write(a, record.framing.payload, source.version, patch.paragraph.flags, max_stream);
                    a.free(verified);
                    found = true;
                    break;
                }
                id += 1;
            }
            if (!found) return error.InvalidParagraphShapeReference;
        }
        if (@import("../../model/border_fill_patch.zig").has(patch.paragraph.border_fill)) {
            var own = try self.formattingSource(a);
            defer own.deinit();
            const id = try self.paragraphShapeId(owner.section, owner.paragraph);
            const alignment = try @import("border_fill_paragraph_current.zig").alignment(own.bytes, own.version, id);
            const verified = try @import("paragraph_alignment_docinfo.zig").writeWithResource(a, own.bytes, own.version, id, alignment, .{}, null, patch.paragraph.flags, patch.paragraph.border_fill, max_stream);
            a.free(verified.bytes);
        }
        if (!patch.hasCharacter()) return;
        const spans = try self.characterRanges(a, owner.section, owner.paragraph);
        defer a.free(spans);
        var local: ?FormattingSource = null;
        defer if (local) |*owned| owned.deinit();
        const current = if (cached) |known| known else blk: {
            local = try self.formattingSource(a);
            break :blk &local.?;
        };
        const version = current.version;
        var iterator = try @import("../docinfo/reader.zig").Iterator.init(current.bytes, version, .{});
        var id: u32 = 0;
        while (try iterator.next()) |record| {
            if (record.value != .char_shape) continue;
            var selected = false;
            for (spans) |span| {
                if (span.char_shape_id != id) continue;
                for (ranges) |range| if (@max(span.start_unit, range.startUnit) < @min(span.end_unit, range.endUnit)) {
                    selected = true;
                    break;
                };
            }
            if (selected) {
                if (patch.character.border_fill != null) {
                    const verified = try @import("character_property_docinfo.zig").write(a, current.bytes, version, id, patch.character, max_stream);
                    a.free(verified.bytes);
                    continue;
                }
                const verified = try @import("character_property_payload.zig").write(a, record.framing.payload, version, patch.character, max_stream);
                a.free(verified);
            }
            id += 1;
        }
    }

    /// Caller-owned scalar snapshot, never a second mutable resource model.
    pub fn fontFaces(self: *const Session, a: std.mem.Allocator) ![]@import("../../model/font_face_value.zig").Value {
        try self.materializeLiveText();
        return self.fontSnapshot(a, false);
    }

    pub fn fontFaceMetadata(self: *const Session, a: std.mem.Allocator) ![]@import("font_face_snapshot.zig").Metadata {
        try self.materializeLiveText();
        return self.fontSnapshot(a, true);
    }

    /// Current DocInfo resources; caller owns the rows and gradient arrays.
    pub fn borderFillSources(self: *const Session, a: std.mem.Allocator) ![]@import("border_fill_sources.zig").Source {
        try self.materializeLiveText();
        var prepared = try self.cellResources(a);
        defer prepared.deinit(a);
        return @import("border_fill_sources.zig").read(a, prepared.bytes, self.stateConst().source.header.version(), 1_000_000);
    }

    fn cellResources(self: *const Session, a: std.mem.Allocator) !@import("cell_background_write.zig").Prepared {
        const state = self.stateConst();
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const effective = self.formattingDocument();
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &effective, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        var prepared = try @import("cell_background_write.zig").info(a, current, state.source.header.version(), state.cell_backgrounds.entries, max_stream);
        errdefer prepared.deinit(a);
        try prepared.validate(a, state.decoded, &state.document, state.source.header.version());
        return prepared;
    }

    fn fontSnapshot(self: *const Session, a: std.mem.Allocator, comptime metadata: bool) ![]if (metadata) @import("font_face_snapshot.zig").Metadata else @import("../../model/font_face_value.zig").Value {
        const state = self.stateConst();
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const effective = self.formattingDocument();
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &effective, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        const snapshot = @import("font_face_snapshot.zig");
        return if (metadata) snapshot.readMetadata(a, current, state.source.header.version(), 1_000_000, 4096) else snapshot.read(a, current, state.source.header.version(), 1_000_000, 4096);
    }

    /// Caller-owned scalar snapshot, never a second mutable resource model.
    pub fn characterShapes(self: *const Session, a: std.mem.Allocator) ![]@import("character_display_shapes.zig").Shape {
        try self.materializeLiveText();
        const state = self.stateConst();
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const effective = self.formattingDocument();
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &effective, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        return @import("character_display_shapes.zig").read(a, current, state.source.header.version(), self.characterShapeCount());
    }

    /// Caller owns the immutable resource snapshot.
    pub fn bulletDefinitions(self: *const Session, a: std.mem.Allocator) !@import("../../model/paragraph_bullet_definition.zig").Snapshot {
        var current = try self.formattingSource(a);
        defer current.deinit();
        return @import("bullet_definitions.zig").read(a, current.bytes, current.version);
    }
    pub fn authorizeBullet(self: *const Session, section: usize, paragraph_index: usize) !void {
        try self.materializeLiveText();
        try @import("bullet_apply.zig").authorize(&self.stateConst().document, section, paragraph_index);
    }
    pub fn paragraphShapes(self: *const Session, a: std.mem.Allocator) ![]@import("paragraph_display_shapes.zig").Shape {
        try self.materializeLiveText();
        const state = self.stateConst();
        const decoded = if (state.chart_resources.docinfo) |bytes| try a.dupe(u8, bytes) else try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const effective = self.formattingDocument();
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &effective, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        return @import("paragraph_display_shapes.zig").read(a, current, state.source.header.version(), self.paragraphShapeCount());
    }

    pub fn paragraphNumberingDefinitions(self: *const Session, a: std.mem.Allocator) ![]@import("paragraph_numbering_source.zig").Definition {
        // Paragraph-format edits may change references, but cannot edit this resource table.
        const source = self.stateConst().source;
        const decoded = try source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        return @import("paragraph_numbering_source.zig").read(a, decoded, source.header.version());
    }

    /// Scalar inventory only; includes pending created cells without copying text
    /// or resolving anchor order. It never grants edit ownership or permission.
    /// Caller owns the returned sections slice. Native wire total is inclusive.
    pub fn independentTextCoverage(self: *const Session, a: std.mem.Allocator) !@import("../../model/text_transaction.zig").Coverage {
        const tx = @import("../../model/text_transaction.zig");
        const state = self.stateConst();
        if (state.document.sections.len != state.created_tables.len) return error.SourceBindingMismatch;
        if (state.document.sections.len > tx.limits.sections) return error.LimitExceeded;
        const sections = try a.alloc(tx.SectionCoverage, state.document.sections.len);
        errdefer a.free(sections);
        var total: usize = 0;
        var created: usize = 0;
        for (state.document.sections, state.created_tables, sections, 0..) |section, tables, *row, index| {
            var count = section.paragraphs.len;
            if (count > tx.limits.snapshot_paragraphs) return error.LimitExceeded;
            for (tables.entries) |entry| {
                const cells = std.math.mul(usize, entry.value.table.plan.rows, entry.value.table.plan.columns) catch return error.LimitExceeded;
                if (cells == 0 or cells != entry.value.table.cells.len) return error.InvalidCreatedTableCells;
                count = std.math.add(usize, count, cells) catch return error.LimitExceeded;
                created = std.math.add(usize, created, cells) catch return error.LimitExceeded;
                if (count > tx.limits.snapshot_paragraphs) return error.LimitExceeded;
            }
            total = std.math.add(usize, total, count) catch return error.LimitExceeded;
            if (total > tx.limits.snapshot_paragraphs) return error.LimitExceeded;
            row.* = .{ .section = @intCast(index), .paragraphs = @intCast(count) };
        }
        return .{ .sections = sections, .paragraphs = @intCast(total), .created_cell_paragraphs = @intCast(created) };
    }

    pub fn paragraphCount(self: *const Session, section: usize) !usize {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return state.document.sections[section].paragraphs.len;
    }

    pub fn paragraph(self: *const Session, section: usize, index: usize) !ParagraphInfo {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const p = self.stateConst().document.sections[section].paragraphs[index];
        return .{ .source_node = p.source_node, .parent_node = p.parent_node, .style_id = p.style_id };
    }

    pub fn validateTextSourcePolicy(self: *const Session, section: usize) !void {
        try self.materializeLiveText();
        const state = self.stateConst();
        try @import("text_source_policy.zig").validate(state.allocator, state.decoded, state.source.header.version(), section);
    }
    pub fn textSourceProtection(self: *const Session, a: std.mem.Allocator, section: usize) !@import("text_source_protection.zig").Snapshot {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("text_source_protection.zig").read(a, state.decoded, state.source.header.version(), section, state.document.sections[section]);
    }

    pub fn editableTextLength(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) !u32 {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const state = self.stateConst();
        if (state.live_text) |backing| if (backing.section == section and backing.paragraph == index) return @intCast(backing.len() - 1);
        const paragraph_value = self.stateConst().document.sections[section].paragraphs[index];
        const bytes = try @import("plain_text_content.zig").editableTextBytes(a, paragraph_value);
        defer a.free(bytes);
        if (bytes.len < 2 or bytes.len % 2 != 0 or std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
        return std.math.cast(u32, bytes.len / 2 - 1) orelse error.LimitExceeded;
    }

    /// Owned UTF-16LE token bytes, including the original paragraph terminator.
    pub fn copyText(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) ![]u8 {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const state = @constCast(self.stateConst());
        if (state.live_text) |*backing| if (backing.section == section and backing.paragraph == index) return backing.materialize(a);
        return @import("plain_text.zig").textBytes(a, self.stateConst().document.sections[section].paragraphs[index]);
    }

    /// 원본 current reference의 plain 문단만 읽는다. 전체 canonical materialize 없음.
    pub fn copySourceTextWindowUtf16(self: *const Session, a: std.mem.Allocator, section: usize, host: @import("created_table_anchor.zig").Host, start: u32, end: u32) !@import("live_text_window.zig").Window {
        if (host != .original_node) return error.UnsupportedTextWindowReference;
        const state = @constCast(self.stateConst());
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = state.document.sections[section];
        // 같은 검증 owner의 연속 ACK 읽기는 문단 배열 전체 재탐색도 피한다.
        if (state.live_text) |*backing| if (backing.section == section and backing.source_node == host.original_node) {
            if (backing.paragraph >= current.paragraphs.len) return error.SourceBindingMismatch;
            const selected = current.paragraphs[backing.paragraph];
            if (try selected.originalNode() != host.original_node or selected.source_node.? >= current.source_record_count) return error.SourceBindingMismatch;
            if (selected.parent_node) |parent| if (parent >= current.source_record_count) return error.SourceBindingMismatch;
            return @import("live_text_window.zig").gap(a, selected, backing, start, end);
        };
        var found: ?usize = null;
        for (current.paragraphs, 0..) |p, i| {
            if (p.source_node == null or p.source_node.? != host.original_node) continue;
            if (found != null or try p.originalNode() >= current.source_record_count) return error.SourceBindingMismatch;
            if (p.parent_node) |parent| if (parent >= current.source_record_count) return error.SourceBindingMismatch;
            found = i;
        }
        const index = found orelse return error.MissingParagraphSource;
        const p = current.paragraphs[index];
        if (state.live_text) |*backing| if (backing.section == section and backing.paragraph == index) {
            return @import("live_text_window.zig").gap(a, p, backing, start, end);
        };
        const window = try @import("live_text_window.zig").canonical(a, p, start, end);
        state.live_totals.window_copy_units += end - start;
        return window;
    }
    /// Synchronous borrowed input; one command and one surrounding history event.
    pub fn applyCellBorders(self: *Session, edits: []const @import("cell_border_values.zig").Edit) !void {
        if (edits.len == 0) return;
        return self.apply(.{ .set_cell_borders = edits });
    }
    fn applyCellBordersBody(self: *Session, edits: []const @import("cell_border_values.zig").Edit) !void {
        if (edits.len == 0) return;
        const state = self.getState();
        const original = try self.originalInfo();
        defer if (original.owned) state.allocator.free(original.bytes);
        try @import("h5cell_border_batch.zig").apply(state.allocator, &state.cell_backgrounds, state.decoded, state.source.header.version(), &state.document, original.bytes, edits, max_stream);
    }

    pub fn applyCellStyles(self: *Session, edits: []const @import("h5cell_style_batch.zig").Request) !void {
        if (edits.len == 0) return;
        return self.apply(.{ .set_cell_styles = edits });
    }
    fn applyCellStylesBody(self: *Session, edits: []const @import("h5cell_style_batch.zig").Request) !void {
        if (edits.len == 0) return;
        const state = self.getState();
        const original = try self.originalInfo();
        defer if (original.owned) state.allocator.free(original.bytes);
        try @import("h5cell_style_batch.zig").apply(state.allocator, &state.cell_backgrounds, state.decoded, state.source.header.version(), &state.document, original.bytes, edits, max_stream);
    }
    pub fn applyCellFills(self: *Session, edits: []const @import("h5cell_fill_batch.zig").Request) !void {
        if (edits.len == 0) return;
        return self.apply(.{ .set_cell_fills = edits });
    }
    fn applyCellFillsBody(self: *Session, edits: []const @import("h5cell_fill_batch.zig").Request) !void {
        if (edits.len == 0) return;
        const state = self.getState();
        const original = try self.originalInfo();
        defer if (original.owned) state.allocator.free(original.bytes);
        try @import("h5cell_fill_batch.zig").apply(state.allocator, &state.cell_backgrounds, state.decoded, state.source.header.version(), &state.document, original.bytes, edits, max_stream);
    }

    /// Check before any external-history barrier, lazy materialization or cache invalidation.
    fn requireManagedAnchoredDispatch(self: *const Session, command: Command) !void {
        if (command != .resize_picture_anchored) return;
        if (!self.historyTransactionActive() or self.stateConst().history_poison_observer == null) return error.HistoryProtocol2Required;
    }
    pub fn apply(self: *Session, command: Command) !void {
        if (command == .edit_page_restart) return error.HistoryProtocol2Required;
        if (command == .set_cell_vertical_alignment_block or command == .set_cell_insets) return error.HistoryProtocol2Required;
        if (command == .resize_picture_anchored) return error.HistoryProtocol2Required;
        return self.applyWithFontCache(command, null);
    }
    pub fn applyWithFontCache(self: *Session, command: Command, font_cache: ?*@import("../../model/batch_font_lookup.zig").Cache) !void {
        if (command == .edit_page_restart and (!self.historyTransactionActive() or self.stateConst().history_poison_observer == null)) return error.HistoryProtocol2Required;
        if (command == .set_cell_vertical_alignment_block or command == .set_cell_insets) try self.requireManagedCellBlock();
        try self.requireManagedAnchoredDispatch(command);
        self.invalidateStrictLayout();
        // Helpers may replace a whole Section clone. Refresh borrowed bases before returning.
        defer if (self.getState().has_source_rebases) self.getState().refreshSourceViews();
        errdefer if (font_cache) |cache| cache.clear();
        errdefer if (self.getState().formatting_batch) |context| context.characters.abort(self.getState().allocator);
        // Grouped policy proof borrows immutable section sources only across
        // adjacent grouped paints. Other commands can rebase a section in place.
        if (command != .set_character_grouped_insertion) if (self.getState().formatting_batch) |context| {
            context.grouped_source = null;
            context.grouped_excluded_section = null;
        };
        if (font_cache) |cache| switch (command) {
            .set_character_font_name, .set_character_properties, .set_character_grouped_insertion, .set_character_format, .set_paragraph_format, .set_paragraph_alignment, .set_paragraph_flags, .set_paragraph_border_fill, .set_paragraph_margins, .set_paragraph_spacing => {},
            else => cache.clear(),
        };
        try self.materializeLiveText();
        const before = try self.externalHistoryBegin();
        self.applyBody(command, font_cache) catch |err| {
            try self.externalHistoryEnd(before, err);
            return err;
        };
        try self.externalHistoryEnd(before, null);
    }
    fn applyBody(self: *Session, command: Command, font_cache: ?*@import("../../model/batch_font_lookup.zig").Cache) anyerror!void {
        try self.materializeLiveText();
        // Formula-definition label rebasing with pending objects is not wired.
        switch (command) {
            .set_formula_definition => {
                for (self.stateConst().created_tables) |tables| if (tables.entries.len != 0) return error.UnsupportedCreatedTableHostEdit;
            },
            else => {},
        }
        switch (command) {
            .splice_current_paragraph => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                switch (edit.reference) {
                    .source => |reference| {
                        if (reference.section != edit.section) return error.SourceBindingMismatch;
                        const index = try @import("created_table_anchor.zig").resolve(state.allocator, &state.document.sections[edit.section], .{ .host = reference.host, .unit = 0 });
                        return self.apply(.{ .splice_text = .{ .section = edit.section, .paragraph = index, .start_unit = edit.start_unit, .end_unit = edit.end_unit, .utf8 = edit.utf8 } });
                    },
                    .created_cell => |point| {
                        if (point.section != edit.section) return error.SourceBindingMismatch;
                        return @import("created_cell_text.zig").applySplice(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), .{ .point = point, .start = edit.start_unit, .end = edit.end_unit, .utf8 = edit.utf8 }, self.createdTableResources(), created_table_limits);
                    },
                }
            },
            .edit_chart_literals => |request| {
                const state = self.getState();
                var context = try self.prepareChartLiteralEdit(state.allocator, request.plan);
                defer context.deinit(state.allocator);
                if (!context.patch.changed) {
                    // A no-op cannot smuggle a raster-only update into History.
                    if (request.rendered != null) return error.UnexpectedChartLiteralEditNoopRaster;
                    return;
                }
                const rendered = request.rendered orelse return error.MissingChartLiteralEditRaster;
                const before_file = try self.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(before_file.bytes);
                const info = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream);
                defer state.allocator.free(info);
                var assets = try @import("../chart/literal_edit_resource.zig").prepare(state.allocator, &state.source.file, state.chart_resources, info, state.source.header.version(), &context.input, &context.patch, rendered, max_bytes);
                defer assets.deinit(state.allocator);
                var prepared = try @import("../chart/literal_edit_sections.zig").prepare(state.allocator, state.decoded, state.document.sections, state.style_offsets, state.source.header.version(), request.plan.owners, assets.ordinal);
                defer prepared.deinit(state.allocator);
                var prospective = state.*;
                const sections = try state.allocator.dupe(model.Section, state.document.sections);
                defer state.allocator.free(sections);
                for (prepared.sections) |part| sections[part.index] = part.value;
                prospective.document.sections = sections;
                const decoded = try state.allocator.dupe([]u8, state.decoded);
                defer state.allocator.free(decoded);
                const offsets = try state.allocator.dupe([]usize, state.style_offsets);
                defer state.allocator.free(offsets);
                prospective.decoded = decoded;
                prospective.style_offsets = offsets;
                prospective.chart_resources = assets.values;
                prospective.refreshSourceViews();
                const draft: *const Session = @ptrCast(&prospective);
                const saved = try draft.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(saved.bytes);
                try @import("../chart/literal_edit_verify.zig").verify(state.allocator, before_file.bytes, saved.bytes, request.plan.owners, assets.values.entries[assets.values.entries.len - 1], max_bytes, max_stream);
                // Exactly one publication. Existing History owns source bytes and COW resources together.
                for (prepared.sections) |*part| std.mem.swap(model.Section, &state.document.sections[part.index], &part.value);
                std.mem.swap(@import("../chart/created_resources.zig").Values, &state.chart_resources, &assets.values);
                state.refreshSourceViews();
            },
            .replace_picture => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                const types = @import("../../model/picture_replacement.zig");
                const ticket = try self.historyTicket();
                if (!std.meta.eql(ticket, request.ticket)) return error.StaleMutationEpoch;
                var actual = try self.pictureReplacementOwner(state.allocator, request.owner.section, request.owner.pictureNode, request.owner.historyRevision, request.owner.binding);
                defer actual.deinit(state.allocator);
                if (!types.matches(actual, request.owner)) return error.StalePictureReplacementOwner;
                _ = try @import("../../image/picture_input.zig").inspectImage(request.image, types.max_image_bytes);
                const old = try self.binaryResource(state.allocator, try std.fmt.parseInt(u16, actual.resourceLink, 10), types.max_image_bytes);
                defer state.allocator.free(old);
                if (std.mem.eql(u8, old, request.image)) return;
                const index = actual.section;
                const ordinal = try std.fmt.parseInt(u16, actual.resourceLink, 10);
                const info = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream);
                defer state.allocator.free(info);
                var assets = try @import("image_create_asset.zig").prepareImage(state.allocator, &state.source.file, state.chart_resources, info, state.source.header.version(), request.image, max_bytes);
                defer assets.deinit(state.allocator);
                var section = try @import("picture_replacement_current.zig").section(state.allocator, state.document.sections[index], state.decoded[index], state.style_offsets[index], state.source.header.version(), actual.pictureNode, ordinal, assets.ordinal);
                defer section.deinit(state.allocator);
                var prospective = state.*;
                const sections = try state.allocator.dupe(model.Section, state.document.sections);
                defer state.allocator.free(sections);
                sections[index] = section;
                prospective.document.sections = sections;
                const decoded = try state.allocator.dupe([]u8, state.decoded);
                defer state.allocator.free(decoded);
                const offsets = try state.allocator.dupe([]usize, state.style_offsets);
                defer state.allocator.free(offsets);
                prospective.decoded = decoded;
                prospective.style_offsets = offsets;
                prospective.chart_resources = assets.values;
                prospective.refreshSourceViews();
                const draft: *const Session = @ptrCast(&prospective);
                const saved = try draft.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(saved.bytes);
                // The same save/checkpoint ledger already used for authored PNG/JPEG.
                // The only source delta above is this picture's two-byte reference.
                std.mem.swap(model.Section, &state.document.sections[index], &section);
                std.mem.swap(@import("../chart/created_resources.zig").Values, &state.chart_resources, &assets.values);
                state.refreshSourceViews();
            },
            .insert_image => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedPictureInsertionSaveFeatures;
                if (state.source.header.version().raw < 0x05000300 or state.source.header.version().raw >= 0x05010000) return error.UnsupportedPictureInsertionVersion;
                _ = try @import("image_insertion_profile.zig").layout(state.source.header.version());
                try @import("image_create_request.zig").validate(request);
                const ticket = try self.historyTicket();
                if (!std.meta.eql(request.target.binding.?.binding, ticket.binding)) return error.SourceBindingMismatch;
                if (request.target.binding.?.epoch != ticket.epoch) return error.StaleMutationEpoch;
                const info = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream);
                defer state.allocator.free(info);
                var assets = try @import("image_create_asset.zig").prepare(state.allocator, &state.source.file, state.chart_resources, info, state.source.header.version(), request, max_bytes);
                defer assets.deinit(state.allocator);
                var prepared = try @import("image_create_session.zig").prepare(state.allocator, state.decoded, &state.document, state.created_tables, state.cell_backgrounds, state.source.header.version(), request, assets.ordinal, self.createdTableResources(), created_table_limits);
                defer prepared.deinit(state.allocator);
                // Validate a borrowed prospective State through the actual save
                // path. Only pointer arrays are copied; no live value is written.
                var prospective = state.*;
                const sections = try state.allocator.dupe(model.Section, state.document.sections);
                defer state.allocator.free(sections);
                sections[request.target.section] = prepared.section;
                prospective.document.sections = sections;
                const tables = try state.allocator.dupe(@import("created_table_values.zig").Values, state.created_tables);
                defer state.allocator.free(tables);
                tables[request.target.section] = prepared.tables;
                prospective.created_tables = tables;
                const decoded = try state.allocator.dupe([]u8, state.decoded);
                defer state.allocator.free(decoded);
                const offsets = try state.allocator.dupe([]usize, state.style_offsets);
                defer state.allocator.free(offsets);
                prospective.decoded = decoded;
                prospective.style_offsets = offsets;
                prospective.cell_backgrounds = prepared.backgrounds;
                prospective.chart_resources = assets.values;
                prospective.refreshSourceViews();
                const draft: *const Session = @ptrCast(&prospective);
                const saved = try draft.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(saved.bytes);
                try @import("image_create_session.zig").verifyFile(state.allocator, saved.bytes, request, assets.ordinal, assets.values.entries[assets.values.entries.len - 1]);
                // All validation and allocation precede the single publication.
                std.mem.swap(model.Section, &state.document.sections[request.target.section], &prepared.section);
                std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables[request.target.section], &prepared.tables);
                std.mem.swap(@import("cell_background_values.zig").Values, &state.cell_backgrounds, &prepared.backgrounds);
                std.mem.swap(@import("../chart/created_resources.zig").Values, &state.chart_resources, &assets.values);
                state.refreshSourceViews();
            },
            .insert_chart => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedChartSaveFeatures;
                try @import("../chart/create_request.zig").validate(request);
                const ticket = try self.historyTicket();
                if (!std.meta.eql(request.target.binding.?.binding, ticket.binding)) return error.SourceBindingMismatch;
                if (request.target.binding.?.epoch != ticket.epoch) return error.StaleMutationEpoch;
                const info = if (state.chart_resources.docinfo) |bytes| try state.allocator.dupe(u8, bytes) else try state.source.decodeDocInfo(state.allocator, max_stream);
                defer state.allocator.free(info);
                var assets = try @import("../chart/create_single_asset.zig").prepare(state.allocator, &state.source.file, state.chart_resources, info, state.source.header.version(), request, max_bytes);
                defer assets.deinit(state.allocator);
                var prepared = try @import("../chart/create_session.zig").prepare(state.allocator, state.decoded, &state.document, state.created_tables, state.cell_backgrounds, state.source.header.version(), request, assets.ordinal, self.createdTableResources(), created_table_limits);
                defer prepared.deinit(state.allocator);
                // Validate a borrowed prospective State through the actual save
                // path. Only pointer arrays are copied; no live value is written.
                var prospective = state.*;
                const sections = try state.allocator.dupe(model.Section, state.document.sections);
                defer state.allocator.free(sections);
                sections[request.target.section] = prepared.section;
                prospective.document.sections = sections;
                const tables = try state.allocator.dupe(@import("created_table_values.zig").Values, state.created_tables);
                defer state.allocator.free(tables);
                tables[request.target.section] = prepared.tables;
                prospective.created_tables = tables;
                const decoded = try state.allocator.dupe([]u8, state.decoded);
                defer state.allocator.free(decoded);
                const offsets = try state.allocator.dupe([]usize, state.style_offsets);
                defer state.allocator.free(offsets);
                prospective.decoded = decoded;
                prospective.style_offsets = offsets;
                prospective.cell_backgrounds = prepared.backgrounds;
                prospective.chart_resources = assets.values;
                prospective.refreshSourceViews();
                const draft: *const Session = @ptrCast(&prospective);
                const saved = try draft.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(saved.bytes);
                try @import("../chart/create_verify_file.zig").verify(state.allocator, saved.bytes, request, assets.ordinal, assets.values.entries[assets.values.entries.len - 1]);
                // All validation and allocation precede the single publication.
                std.mem.swap(model.Section, &state.document.sections[request.target.section], &prepared.section);
                std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables[request.target.section], &prepared.tables);
                std.mem.swap(@import("cell_background_values.zig").Values, &state.cell_backgrounds, &prepared.backgrounds);
                std.mem.swap(@import("../chart/created_resources.zig").Values, &state.chart_resources, &assets.values);
                state.refreshSourceViews();
            },
            .edit_equation_script => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedEquationSaveFeatures;
                var candidate = (try @import("equation_script_edit.zig").prepare(state.allocator, state.decoded, &state.document, state.source.header.version(), request, try self.historyTicket(), state.style_count, max_stream)) orelse return;
                defer candidate.deinit(state.allocator);
                var prospective = state.*;
                const sections = try state.allocator.dupe(model.Section, state.document.sections);
                defer state.allocator.free(sections);
                sections[request.before.selector.section] = candidate;
                prospective.document.sections = sections;
                const decoded = try state.allocator.dupe([]u8, state.decoded);
                defer state.allocator.free(decoded);
                const offsets = try state.allocator.dupe([]usize, state.style_offsets);
                defer state.allocator.free(offsets);
                prospective.decoded = decoded;
                prospective.style_offsets = offsets;
                prospective.refreshSourceViews();
                const draft: *const Session = @ptrCast(&prospective);
                const saved = try draft.save(state.allocator, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
                defer state.allocator.free(saved.bytes);
                try @import("equation_script_edit.zig").verifySaved(state.allocator, saved.bytes, request);
                // One publication after full save/reopen validation and allocation.
                std.mem.swap(model.Section, &state.document.sections[request.before.selector.section], &candidate);
                state.refreshSourceViews();
            },
            .insert_equation => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedEquationSaveFeatures;
                var prepared = try @import("equation_create_session.zig").prepare(state.allocator, state.decoded, &state.document, state.created_tables, state.cell_backgrounds, state.source.header.version(), request, self.createdTableResources(), created_table_limits);
                defer prepared.deinit(state.allocator);
                // All fallible work precedes this publication. The existing
                // History/table checkpoint owns the three values as one commit.
                std.mem.swap(model.Section, &state.document.sections[request.target.section], &prepared.section);
                std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables[request.target.section], &prepared.tables);
                std.mem.swap(@import("cell_background_values.zig").Values, &state.cell_backgrounds, &prepared.backgrounds);
                state.refreshSourceViews();
            },
            .stage_table => |edit| {
                const state = self.getState();
                try @import("created_table_stage.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
            },
            .set_created_cell_text => |edit| {
                const state = self.getState();
                try @import("created_cell_text.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
            },
            .splice_created_cell => |edit| try self.applyCreatedCellTyping(edit),
            .edit_created_cell_properties => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedCreatedCellPropertiesSaveFeatures;
                const section = request.address.section;
                if (section >= state.created_tables.len) return error.InvalidSection;
                var selected: ?usize = null;
                for (state.created_tables, 0..) |tables, part| for (tables.entries, 0..) |entry, i| if (entry.value.table.identity == request.address.identity) {
                    if (selected != null or part != section or request.address.identity == 0) return error.InvalidCreatedTableIdentity;
                    selected = i;
                };
                const index = selected orelse return error.InvalidCreatedTableIdentity;
                const entry = state.created_tables[section].entries[index];
                const host = try @import("created_table_anchor.zig").resolve(state.allocator, &state.document.sections[section], entry.anchor);
                var protection = try @import("text_source_protection.zig").read(state.allocator, state.decoded, state.source.header.version(), section, state.document.sections[section]);
                defer protection.deinit(state.allocator);
                if (host >= protection.protected_paragraphs.len or protection.protected_paragraphs[host]) return error.ProtectedCell;
                if (request.vertical_alignment != null and entry.value.options.cell.attributes & (@as(u32, 1) << 17) != 0) return error.ProtectedCell;
                const alignment_base = @import("../../model/cell_vertical_alignment.zig").fromRaw((entry.value.options.cell.attributes >> 5) & 3);
                var replacement = (try @import("../../model/created_cell_properties_table.zig").prepareWithAlignmentBase(state.allocator, &entry.value.table, section, try self.historyTicket(), request, max_stream, alignment_base)) orelse return;
                defer replacement.deinit(state.allocator);
                const cell_index = @as(usize, request.address.row) * replacement.plan.columns + request.address.column;
                const info = try self.originalInfo();
                defer if (info.owned) state.allocator.free(info.bytes);
                var resources = try @import("cell_background_write.zig").resourceIndex(state.allocator, info.bytes, state.source.header.version(), max_stream);
                defer resources.deinit(state.allocator);
                const empty: [40]u8 = @splat(0);
                const original = if (replacement.resources.border_fill == 0) @as([]const u8, &empty) else (try resources.resource(std.math.cast(u16, replacement.resources.border_fill) orelse return error.InvalidBorderFillReference)).payload;
                replacement.cell_properties[cell_index].appearance = @import("../../model/border_fill_patch.zig").canonical(try @import("border_fill_payload_patch.zig").observe(original), replacement.cell_properties[cell_index].appearance);
                var candidate = try state.created_tables[section].clone(state.allocator, max_stream);
                defer candidate.deinit(state.allocator);
                std.mem.swap(@import("../../model/created_table.zig").Table, &candidate.entries[index].value.table, &replacement);
                _ = try candidate.byteSize(max_stream);
                _ = try self.commitCreatedTableCandidate(section, &candidate);
            },
            .edit_created_table_grid => |edit| {
                const state = self.getState();
                var has_properties = false;
                if (edit.section >= state.created_tables.len) return error.InvalidSection;
                for (state.created_tables[edit.section].entries) |entry| if (entry.value.table.cell_properties.len != 0) {
                    has_properties = true;
                };
                if (has_properties) {
                    var candidate = try @import("created_table_grid_session.zig").prepare(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
                    defer candidate.deinit(state.allocator);
                    _ = try self.commitCreatedTableCandidate(edit.section, &candidate);
                } else {
                    try @import("created_table_grid_session.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
                }
            },
            .split_source_table_cell => |edit| {
                const state = self.getState();
                if (edit.section >= state.decoded.len) return error.InvalidSection;
                // Rebase changes record identities across the section. Retain only
                // the existing strict selected-source policy and the existing
                // unselected structure preservation contract for every other section.
                for (state.decoded, 0..) |bytes, section| {
                    if (section == edit.section) {
                        try @import("source_policy.zig").validate(state.allocator, bytes, state.source.header.version());
                    } else {
                        try @import("source_policy.zig").validateUnselectedStructureSection(state.allocator, bytes, state.source.header.version());
                    }
                }
                try @import("source_table_cell_split_service.zig").validateOwner(self, state.allocator, edit);
                return self.apply(.{ .edit_source_table_grid = .{
                    .section = edit.section,
                    .table_node = edit.table_node,
                    .expected_rows = edit.expected_rows,
                    .expected_columns = edit.expected_columns,
                    .split = .{ .row = edit.row, .column = edit.column, .rows = edit.rows, .columns = edit.columns },
                    .layout = .observed8,
                } });
            },
            .edit_source_table_grid => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution)) return error.UnsupportedSourceTableGrid;
                if (state.created_tables[edit.section].entries.len != 0) return error.UnsupportedSourceTableGridPendingObjects;
                // These transient DocInfo clones require an explicit node/resource remap.
                for (state.cell_backgrounds.entries) |entry| if (entry.edit.section == edit.section) return error.UnsupportedSourceTableGridPendingCellStyle;
                const saved = try self.save(state.allocator, .{ .allow_stale_layout = true });
                defer state.allocator.free(saved.bytes);
                const current = state.document.sections[edit.section];
                const original_count = if (current.rebased_source) |basis| basis.original_record_count else current.source_record_count;
                var candidate = try @import("source_table_grid_session.zig").prepare(state.allocator, saved.bytes, state.decoded[edit.section], state.source.header.version(), edit, original_count, state.style_count);
                defer candidate.deinit(state.allocator);
                std.mem.swap(model.Section, &state.document.sections[edit.section], &candidate);
                state.refreshSourceViews();
            },
            .set_character_font_name => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                try @import("../../model/font_name.zig").validate(edit.name, 4096);
                if (edit.start_unit == edit.end_unit) return self.apply(.{ .set_character_properties = .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = edit.start_unit, .end_unit = edit.end_unit, .properties = .{} } });
                const state = self.getState();
                const checkpoint = if (state.formatting_batch == null) try self.createCheckpoint(max_bytes) else null;
                defer if (checkpoint) |value| value.deinit();
                errdefer if (checkpoint) |value| {
                    @import("table_checkpoint.zig").rollbackWithCharts(value, state.allocator, self, &state.document, &state.created_tables, &state.cell_backgrounds, &state.chart_resources) catch unreachable;
                    state.refreshSourceViews();
                };
                const cached = if (font_cache) |cache| cache.get(@backingInt(edit.language), edit.name) else null;
                const id = cached orelse try self.ensureFont(edit.language, edit.name);
                if (font_cache) |cache| cache.put(@backingInt(edit.language), edit.name, id);
                var ids: @import("../../model/character_fonts.zig").Values = @splat(null);
                ids[@backingInt(edit.language)] = id;
                try self.apply(.{ .set_character_properties = .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = edit.start_unit, .end_unit = edit.end_unit, .properties = .{ .font_ids = ids } } });
            },
            .set_paragraph_border_fill => |edit| {
                const state = self.getState();
                const a = state.allocator;
                const prepared_info = try self.originalInfo();
                const decoded = prepared_info.bytes;
                defer if (prepared_info.owned) a.free(decoded);
                try @import("paragraph_alignment_apply.zig").applyWithResources(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, null, .{}, null, edit.flags, edit.patch, max_stream);
            },
            .set_paragraph_flags => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const prepared_info = try self.originalInfo();
                const decoded = prepared_info.bytes;
                defer if (prepared_info.owned) a.free(decoded);
                try @import("paragraph_flags_apply.zig").apply(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, edit.flags, max_stream);
            },
            .set_paragraph_spacing => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const prepared_info = try self.originalInfo();
                const decoded = prepared_info.bytes;
                defer if (prepared_info.owned) a.free(decoded);
                try @import("paragraph_alignment_apply.zig").applyWithProperties(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, null, .{}, edit.spacing, max_stream);
            },
            .set_paragraph_margins => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const prepared_info = try self.originalInfo();
                const decoded = prepared_info.bytes;
                defer if (prepared_info.owned) a.free(decoded);
                try @import("paragraph_alignment_apply.zig").applyWithMargins(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, null, edit.margins, max_stream);
            },
            .set_paragraph_bullet => |value| {
                const state = self.getState();
                const prepared = try self.originalInfo();
                defer if (prepared.owned) state.allocator.free(prepared.bytes);
                try @import("bullet_apply.zig").applyReference(state.allocator, &state.document, prepared.bytes, state.source.header.version(), state.para_count, state.char_count, value.section, value.paragraph, value.value, max_stream);
            },
            .edit_object_outer_margins, .edit_object_vertical_margins => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                const ticket = try self.historyTicket();
                if (!std.meta.eql(ticket, request.target.ticket)) return error.StaleMutationEpoch;
                const index = request.target.selector.section;
                if (index >= state.document.sections.len) return error.InvalidSection;
                const section = &state.document.sections[index];
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                const margin_source = @import("object_outer_margins.zig");
                const prepared = if (command == .edit_object_vertical_margins)
                    try margin_source.writeObservedVertical(state.allocator, state.decoded[index], state.source.header.version(), section.*, request, ticket, read_only)
                else
                    try margin_source.write(state.allocator, state.decoded[index], state.source.header.version(), section.*, request, ticket, read_only);
                const bytes = prepared orelse return;
                errdefer state.allocator.free(bytes);
                if (bytes.len != state.decoded[index].len) return error.SourceBindingMismatch;
                // Prepare every fallible allocation before publishing. Existing checkpoints own
                // the previous basis; all current paragraphs and pending resource intents stay live.
                const offsets = try state.allocator.dupe(usize, state.style_offsets[index]);
                var old = section.rebased_source;
                section.rebased_source = .{ .bytes = bytes, .style_offsets = offsets, .original_record_count = if (old) |basis| basis.original_record_count else section.source_record_count };
                state.refreshSourceViews();
                if (old) |*basis| basis.deinit(state.allocator);
            },
            .set_cell_vertical_alignment_block => |request| {
                try self.requireManagedCellBlock();
                const state = self.getState();
                const index = request.before.section;
                if (index >= state.document.sections.len) return error.InvalidSection;
                if (state.formatting_batch != null) return error.MutationInProgress;
                const section = &state.document.sections[index];
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                var prepared = (try @import("cell_vertical_alignment_batch_plan.zig").prepare(state.allocator, state.decoded[index], state.source.header.version(), section.*, index, request.before, request.value, try self.historyTicket(), read_only, max_stream)) orelse return;
                var adopted = false;
                defer if (!adopted) prepared.deinit(state.allocator);
                if (prepared.bytes.len != state.decoded[index].len) return error.SourceBindingMismatch;
                const offsets = try state.allocator.dupe(usize, state.style_offsets[index]);
                var old = section.rebased_source;
                section.rebased_source = .{ .bytes = prepared.bytes, .style_offsets = offsets, .original_record_count = if (old) |basis| basis.original_record_count else section.source_record_count };
                adopted = true;
                state.refreshSourceViews();
                if (old) |*basis| basis.deinit(state.allocator);
            },
            .set_cell_insets => |request| {
                try self.requireManagedCellBlock();
                const state = self.getState();
                const index = request.before.selector.section;
                if (index >= state.document.sections.len) return error.InvalidSection;
                if (state.formatting_batch != null) return error.MutationInProgress;
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                const bytes = (try @import("cell_insets_plan.zig").prepare(state.allocator, state.decoded[index], state.source.header.version(), state.document.sections[index], index, request, try self.historyTicket(), read_only, max_stream)) orelse return;
                errdefer state.allocator.free(bytes);
                try self.publishFixedSection(index, bytes, .keep);
            },
            .set_cell_vertical_alignment => |request| {
                const state = self.getState();
                const index = request.before.selector.section;
                if (index >= state.document.sections.len) return error.InvalidSection;
                if (!self.historyTransactionActive()) return error.HistoryProtocol2Required;
                if (state.formatting_batch != null) return error.MutationInProgress;
                const ticket = try self.historyTicket();
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                const section = &state.document.sections[index];
                const bytes = (try @import("cell_vertical_alignment_plan.zig").write(state.allocator, state.decoded[index], state.source.header.version(), section.*, index, request, ticket, read_only, max_stream)) orelse return;
                errdefer state.allocator.free(bytes);
                if (bytes.len != state.decoded[index].len) return error.SourceBindingMismatch;
                const offsets = try state.allocator.dupe(usize, state.style_offsets[index]);
                var old = section.rebased_source;
                section.rebased_source = .{ .bytes = bytes, .style_offsets = offsets, .original_record_count = if (old) |basis| basis.original_record_count else section.source_record_count };
                state.refreshSourceViews();
                if (old) |*basis| basis.deinit(state.allocator);
            },
            .edit_object_geometry => |request| {
                const state = self.getState();
                const section_index = request.selector.section;
                if (section_index >= state.document.sections.len) return error.InvalidSection;
                if (state.formatting_batch != null) return error.MutationInProgress;
                const section = &state.document.sections[section_index];
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                const bytes = if (request.selector.kind == .chart) chart: {
                    const current = try self.currentDrawingSection(state.allocator, section_index);
                    defer if (current) |value| state.allocator.free(value);
                    break :chart (try @import("chart_object_geometry.zig").write(state.allocator, self, &state.source, !state.chart_resources.empty(), current orelse state.decoded[section_index], state.decoded, state.source.header.version(), section.*, request.*, read_only)) orelse return;
                } else (try @import("object_geometry.zig").write(state.allocator, state.decoded[section_index], state.source.header.version(), section.paragraphs, request.*, read_only)) orelse return;
                errdefer state.allocator.free(bytes);
                try self.publishFixedSection(section_index, bytes, .keep);
            },
            .edit_page_restart => |request| {
                const state = self.getState();
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (!try self.validatePageRestart(request, request.before.revision)) return;
                const index = request.before.target.section;
                const changed = (try @import("page_restart_edit.zig").write(state.allocator, state.decoded[index], state.source.header.version(), request.before.target, request.number)) orelse return;
                errdefer state.allocator.free(changed);
                try self.publishFixedSection(index, changed, .keep);
            },
            .edit_page_settings => |request| {
                const state = self.getState();
                if (!try @import("page_settings_types.zig").validate(state.allocator, self, request.*)) return;
                if (state.formatting_batch != null) return error.MutationInProgress;
                if (state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview)) return error.UnsupportedPageSettingsSaveFeatures;
                // One source pass, then O(1) checks per target. Count was bounded to512 above.
                var pending_cell_style: [512]bool = @splat(false);
                for (state.cell_backgrounds.entries) |entry| {
                    if (entry.edit.section >= state.document.sections.len) return error.SourceBindingMismatch;
                    pending_cell_style[entry.edit.section] = true;
                }
                for (request.targets) |target| {
                    if (@import("page_settings_types.zig").equal(target.expected, request.values)) continue;
                    if (state.created_tables[target.section].entries.len != 0) return error.UnsupportedPageSettingsPendingObjects;
                    if (pending_cell_style[target.section]) return error.UnsupportedPageSettingsPendingCellStyle;
                }
                const saved = try self.save(state.allocator, .{ .allow_stale_layout = true });
                defer state.allocator.free(saved.bytes);
                var source = try @import("../text_source.zig").Source.open(state.allocator, saved.bytes);
                defer source.deinit();
                const drafts = try state.allocator.alloc(?model.Section, request.targets.len);
                defer state.allocator.free(drafts);
                @memset(drafts, null);
                defer for (drafts) |*draft| if (draft.*) |*value| value.deinit(state.allocator);
                for (request.targets, drafts) |target, *draft| {
                    if (@import("page_settings_types.zig").equal(target.expected, request.values)) continue;
                    const raw = try source.decodeSection(state.allocator, target.section);
                    defer state.allocator.free(raw);
                    const snapshot = try @import("page_settings_snapshot.zig").read(state.allocator, raw, state.source.header.version());
                    var expected = target.expected;
                    expected.source_node = snapshot.source_node;
                    if (!std.meta.eql(expected, snapshot)) return error.StalePageSettingsSnapshot;
                    const changed = try @import("page_settings_section.zig").write(state.allocator, raw, state.source.header.version(), request.values);
                    errdefer state.allocator.free(changed);
                    const current = state.document.sections[target.section];
                    draft.* = try @import("page_settings_rebase.zig").project(state.allocator, changed, state.source.header.version(), if (current.rebased_source) |basis| basis.original_record_count else current.source_record_count, state.style_count);
                }
                // All sections prepared and validated before the no-fail publication loop.
                for (request.targets, drafts) |target, *draft| if (draft.* != null) {
                    std.mem.swap(model.Section, &state.document.sections[target.section], &draft.*.?);
                };
                state.refreshSourceViews();
            },
            .edit_bullet_definition => |request| {
                const state = self.getState();
                const prepared = try self.originalInfo();
                defer if (prepared.owned) state.allocator.free(prepared.bytes);
                try @import("bullet_apply.zig").definition(state.allocator, &state.document, prepared.bytes, state.source.header.version(), state.para_count, state.char_count, request, max_stream);
            },
            .set_paragraph_alignment => |edit| {
                if (edit.alignment > 5) return error.InvalidParagraphAlignment;
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const prepared_info = try self.originalInfo();
                const decoded = prepared_info.bytes;
                defer if (prepared_info.owned) a.free(decoded);
                try @import("paragraph_alignment_apply.zig").apply(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, edit.alignment, max_stream);
            },
            .set_paragraph_format => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                try @import("paragraph_format.zig").apply(&state.document.sections[edit.section].paragraphs[edit.paragraph], edit.para_shape_id, self.paragraphShapeCount());
            },
            .select_form_radio => |edit| {
                const state = self.getState();
                try @import("form_radio_apply.zig").apply(state.allocator, state.decoded, state.source.header.version(), state.document.sections, edit, max_stream);
            },
            .set_form_choice => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                try @import("form_choice_apply.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit, max_stream);
            },
            .set_form_text => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                try @import("form_text_apply.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit, max_stream);
            },
            .set_formula_definition => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("plain_text_source.zig").validateSection(state.allocator, bytes, state.source.header.version());
                }
                try @import("formula_definition.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit, self.characterShapeCount(), max_stream);
            },
            .set_cell_border => |edit| {
                try self.applyCellBordersBody(&.{edit});
            },
            .set_cell_borders => |edits| {
                try self.applyCellBordersBody(edits);
            },
            .set_cell_fills => |edits| {
                try self.applyCellFillsBody(edits);
            },
            .set_cell_styles => |edits| {
                try self.applyCellStylesBody(edits);
            },
            .set_cell_background => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                const original = try self.originalInfo();
                defer if (original.owned) state.allocator.free(original.bytes);
                try state.cell_backgrounds.apply(state.allocator, state.decoded[edit.section], state.source.header.version(), state.document.sections[edit.section], original.bytes, edit, max_stream);
            },
            .set_cell_size => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                try @import("table_cell_size_values.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit);
            },
            .set_picture_current_size => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                try @import("picture_current_size_values.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit);
            },
            .resize_picture_anchored => |request| {
                if (!self.historyTransactionActive()) return error.HistoryProtocol2Required;
                const state = self.getState();
                const index = request.target.selector.section;
                if (index >= state.document.sections.len) return error.InvalidSection;
                if (state.formatting_batch != null) return error.MutationInProgress;
                const section = &state.document.sections[index];
                const read_only = state.source.header.has(.distribution) or state.source.header.has(.history) or state.source.header.has(.digital_signature) or state.source.header.has(.signature_preview);
                const bytes = (try @import("picture_anchored_resize.zig").write(state.allocator, state.decoded[index], state.source.header.version(), section.*, request, try self.historyTicket(), read_only)) orelse return;
                errdefer state.allocator.free(bytes);
                const remaining = try @import("picture_anchored_resize.zig").withoutSelected(state.allocator, section.*, request.target.selector.node);
                errdefer if (remaining) |values| state.allocator.free(values);
                try self.publishFixedSection(index, bytes, .{ .replace = remaining });
            },
            .resize_picture => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                try @import("picture_resize_values.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit, max_stream);
            },
            .merge_paragraph => |merge| {
                const state = self.getState();
                for (state.created_tables) |tables| if (tables.entries.len != 0) {
                    return @import("created_table_structure.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), .{ .merge = merge }, self.createdTableResources(), created_table_limits);
                };
                try @import("merge_session.zig").apply(state.allocator, state.decoded, &state.document, state.source.header.version(), merge, self.characterShapeCount(), max_stream);
            },
            .split_paragraph => |edit| {
                const state = self.getState();
                for (state.created_tables) |tables| if (tables.entries.len != 0) {
                    return @import("created_table_structure.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), .{ .split = edit }, self.createdTableResources(), created_table_limits);
                };
                try @import("structure_session.zig").split(state.allocator, state.decoded, &state.document, state.source.header.version(), edit, self.characterShapeCount(), max_stream);
            },
            .set_style => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                if (edit.style_id >= state.style_count) return error.InvalidStyleReference;
                state.document.sections[edit.section].paragraphs[edit.paragraph].style_id = edit.style_id;
            },
            .splice_independent_text => |groups| {
                const state = self.getState();
                _ = try @import("independent_text_session.zig").apply(state.allocator, state.decoded, state.source.header.version(), &state.document, state.created_tables, groups, self.characterShapeCount());
            },
            .splice_document_text => |groups| {
                const state = self.getState();
                _ = try @import("document_text_session.zig").apply(state.allocator, state.decoded, state.source.header.version(), &state.document, state.created_tables, groups, self.createdTableResources(), created_table_limits);
            },
            .splice_text => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                // This command only changes target text, retaining object IDs
                // and numbering declarations. Other section models stay intact.
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("source_policy.zig").validateUnselectedTextSection(state.allocator, bytes, state.source.header.version());
                }
                if (state.created_tables[edit.section].entries.len != 0) {
                    try @import("created_table_host_splice.zig").apply(state.allocator, state.decoded[edit.section], &state.document.sections[edit.section], &state.created_tables[edit.section], state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
                } else try @import("paragraph_splice.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section], edit, self.characterShapeCount());
            },
            .set_character_grouped_insertion => |edit| try self.applyGroupedInsertion(edit, font_cache),
            .set_character_properties => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("source_policy.zig").validateUnselectedCharacterFormat(state.allocator, bytes, state.source.header.version());
                }
                const prepared_info = try self.originalInfo();
                const info = prepared_info.bytes;
                defer if (prepared_info.owned) state.allocator.free(info);
                try @import("character_property_apply.zig").applyScoped(state.allocator, state.decoded[edit.section], info, state.source.header.version(), &state.document, edit, state.char_count, max_stream, if (state.formatting_batch) |context| &context.characters else null);
            },
            .set_character_format => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("source_policy.zig").validateUnselectedCharacterFormat(state.allocator, bytes, state.source.header.version());
                }
                try @import("character_format.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section].paragraphs[edit.paragraph], edit, self.characterShapeCount());
            },
            // No promise to relocate unknown cross-references after structure edits.
            .insert_text, .delete_paragraph => return error.UnsupportedStructuralEdit,
        }
    }

    /// Native-owned created paragraph; resources and exact splice share History.
    /// Prospective serialization precedes the only live table-value swap.
    fn commitCreatedTableCandidate(self: *Session, section: usize, candidate: *@import("created_table_values.zig").Values) !bool {
        const state = self.getState();
        const a = state.allocator;
        const before = try self.save(a, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
        defer a.free(before.bytes);
        var prospective = state.*;
        const tables = try a.dupe(@import("created_table_values.zig").Values, state.created_tables);
        defer a.free(tables);
        tables[section] = candidate.*;
        prospective.created_tables = tables;
        const draft: *const Session = @ptrCast(&prospective);
        const after = try draft.save(a, .{ .allow_stale_layout = true, .max_output_bytes = max_bytes });
        defer a.free(after.bytes);
        if (std.mem.eql(u8, before.bytes, after.bytes)) return false;
        std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables[section], candidate);
        return true;
    }
    fn applyCreatedCellTyping(self: *Session, edit: @import("../../model/created_cell_typing.zig").Edit) !void {
        try @import("../../model/created_cell_typing.zig").validate(edit);
        const state = self.getState();
        const a = state.allocator;
        const batch = state.formatting_batch orelse return error.FormattingBatchNotPrepared;
        if (!self.historyTransactionActive()) return error.HistoryProtocolRequired;
        if (edit.section >= state.created_tables.len) return error.InvalidSection;
        var index: ?usize = null;
        for (state.created_tables[edit.section].entries, 0..) |entry, i| if (entry.value.table.identity == edit.identity) {
            if (index != null) return error.InvalidCreatedTableIdentity;
            index = i;
        };
        const at = index orelse return error.InvalidCreatedTableIdentity;
        const original = &state.created_tables[edit.section].entries[at].value.table;
        _ = try original.plan.cell(edit.row, edit.column);
        const cell = @as(usize, edit.row) * original.plan.columns + edit.column;
        if (cell >= original.cells.len) return error.InvalidTableCell;
        const source_id = try original.cells[cell].typingResourceId(original.resources.character, edit.start, edit.end, .at_start);
        var candidate = try state.created_tables[edit.section].clone(a, created_table_limits.max_bytes);
        defer candidate.deinit(a);
        var inserted_id: ?u32 = null;
        if (edit.text.len != 0) {
            var properties = @import("../../model/formatting_patch.zig").CharacterIntent.init(edit.insertion).properties orelse model.CharacterPropertyPatch{};
            var ids = properties.font_ids orelse @as(@import("../../model/character_fonts.zig").Values, @splat(null));
            var has_ids = properties.font_ids != null;
            for (edit.insertion.fonts, 0..) |font, language| if (font) |value| switch (value) {
                .id => {},
                .name => |name| {
                    ids[language] = try self.ensureFont(@fromBackingInt(@intCast(language)), name);
                    has_ids = true;
                },
            };
            if (has_ids) properties.font_ids = ids;
            const info = try self.originalInfo();
            defer if (info.owned) a.free(info.bytes);
            inserted_id = try @import("character_property_apply.zig").resolveInsertedResource(a, info.bytes, state.source.header.version(), &state.document, state.char_count, max_stream, source_id, properties, &batch.characters);
        }
        const table = &candidate.entries[at].value.table;
        if (!try table.cells[cell].splice(a, table.resources.character, edit.start, edit.end, edit.text, inserted_id, created_table_limits.max_bytes)) return;
        _ = try candidate.byteSize(created_table_limits.max_bytes);
        try self.finishFormattingBatch();
        const verified = try @import("created_table_section.zig").write(a, state.decoded[edit.section], state.document.sections[edit.section], &candidate, state.source.header.version(), self.createdTableResources(), created_table_limits);
        defer a.free(verified);
        std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables[edit.section], &candidate);
    }

    /// Rich-only group. Source policy and resource allocation remain inside
    /// the same managed History transaction as the preceding bulk text.
    fn applyGroupedInsertion(self: *Session, edit: @import("character_property_apply.zig").GroupEdit, font_cache: ?*@import("../../model/batch_font_lookup.zig").Cache) !void {
        const state = self.getState();
        const a = state.allocator;
        const batch = state.formatting_batch orelse return error.HistoryProtocolRequired;
        if (!self.historyTransactionActive()) return error.HistoryProtocolRequired;
        if (edit.section >= state.decoded.len) return error.InvalidSection;
        if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
        if (edit.insertion.hasParagraph() or edit.insertion.reset != null) return error.UnsupportedTextInsertionFormatting;
        if (edit.ranges.len == 0) return error.EmptyCharacterSelection;
        const version = state.source.header.version();
        if (batch.grouped_source) |source| {
            if (source.ptr != state.decoded.ptr or source.len != state.decoded.len or batch.grouped_version != version.raw) return error.SourceBindingMismatch;
            if (batch.grouped_excluded_section) |excluded| if (excluded != edit.section) {
                try @import("source_policy.zig").validateUnselectedCharacterFormat(a, source[excluded], version);
                if (@import("builtin").is_test) batch.grouped_work.unselected_sections += 1;
                batch.grouped_excluded_section = null;
            };
        } else {
            for (state.decoded, 0..) |bytes, index| if (index != edit.section) {
                try @import("source_policy.zig").validateUnselectedCharacterFormat(a, bytes, version);
                if (@import("builtin").is_test) batch.grouped_work.unselected_sections += 1;
            };
            batch.grouped_source = state.decoded;
            batch.grouped_version = version.raw;
            batch.grouped_excluded_section = edit.section;
        }
        const prepared = try self.originalInfo();
        defer if (prepared.owned) a.free(prepared.bytes);
        var properties = edit.insertion.character;
        const fonts = @import("../../model/character_fonts.zig");
        var ids = properties.font_ids orelse @as(fonts.Values, @splat(null));
        var has_ids = properties.font_ids != null;
        for (edit.insertion.fonts, 0..) |intent, index| if (intent) |font| switch (font) {
            .id => |id| {
                ids[index] = id;
                has_ids = true;
            },
            .name => {},
        };
        if (has_ids) properties.font_ids = ids;
        const writer = @import("character_property_apply.zig");
        // Explicit IDs must still be valid even if a later name in that
        // language overrides them (same precedence as the former commands).
        try @import("character_property_payload.zig").validate(properties);
        try writer.validateFontIds(a, prepared.bytes, version, &state.document, properties, &batch.characters);
        for (edit.insertion.fonts, 0..) |intent, index| if (intent) |font| switch (font) {
            .id => {},
            .name => |name| {
                const language: fonts.Language = @fromBackingInt(@intCast(index));
                const cached = if (font_cache) |cache| cache.get(@intCast(index), name) else null;
                ids[index] = cached orelse blk: {
                    if (@import("builtin").is_test) batch.grouped_work.font_names += 1;
                    const id = try self.ensureFont(language, name);
                    if (font_cache) |cache| cache.put(@intCast(index), name, id);
                    break :blk id;
                };
                has_ids = true;
            },
        };
        if (has_ids) properties.font_ids = ids;
        try writer.applyGrouped(a, state.decoded[edit.section], prepared.bytes, version, &state.document, edit.section, edit.paragraph, properties, edit.ranges, state.char_count, max_stream, &batch.characters, if (@import("builtin").is_test) &batch.grouped_work else {});
    }

    /// Conservative invalidation also covers rejected mutations. Never restored by undo.
    pub fn invalidateStrictLayout(self: *Session) void {
        self.getState().strict_layout_serial +|= 1;
    }
    fn strictLayoutReady(self: *const Session) !void {
        const state = self.stateConst();
        if (state.strict_layout_serial == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        if (self.historyTransactionActive() or state.formatting_batch != null) return error.MutationInProgress;
        _ = try self.historyTicket();
        if (state.observed_docinfo != null or state.source.header.has(.distribution) or state.document.sections.len != 1 or state.created_tables[0].entries.len != 0) return error.UnsupportedStrictBody;
        if (!state.chart_resources.empty() or state.document.bullet_resources.len != 0 or state.cell_backgrounds.entries.len != 0) return error.UnsupportedStrictResources;
        const section = state.document.sections[0];
        if (section.form_values != null or section.picture_current_sizes != null or section.table_cell_sizes != null) return error.UnsupportedStrictBody;
    }
    fn strictCurrentSection(self: *const Session, a: std.mem.Allocator) ![]u8 {
        const state = self.stateConst();
        const section = state.document.sections[0];
        var structural = section.paragraphs.len != state.style_offsets[0].len;
        for (section.paragraphs) |p| if (p.source_node == null) {
            structural = true;
            break;
        };
        return if (structural)
            @import("structure_section_writer.zig").writeWithDeletions(a, state.decoded[0], section, state.source.header.version(), self.characterShapeCount(), max_stream, true)
        else
            @import("text_section_writer.zig").write(a, state.decoded[0], section, state.source.header.version(), max_stream);
    }
    pub fn prepareStrictLayout(self: *const Session, a: std.mem.Allocator) !@import("strict_plain_layout.zig").Snapshot {
        try self.materializeLiveText();
        try self.strictLayoutReady();
        const state = self.stateConst();
        const draft = try self.strictCurrentSection(a);
        defer a.free(draft);
        var resources = try self.cellResources(a);
        defer resources.deinit(a);
        const docinfo = resources.bytes;
        const mutable = @constCast(self).getState();
        if (mutable.strict_layout_lease == null) mutable.strict_layout_lease = try @import("strict_plain_layout.zig").Lease.create(state.allocator);
        return @import("strict_plain_layout.zig").prepare(a, draft, docinfo, state.source.header.version(), @intFromPtr(self), state.strict_layout_serial, try self.historyTicket(), mutable.strict_layout_lease.?);
    }
    fn validateStrictLayoutOwner(self: *const Session, request: @import("strict_plain_layout.zig").Request) !void {
        try self.strictLayoutReady();
        const snapshot = request.snapshot;
        if (snapshot.lease.closed or self.stateConst().strict_layout_lease != snapshot.lease or snapshot.owner != @intFromPtr(self) or snapshot.serial != self.stateConst().strict_layout_serial or !std.meta.eql(snapshot.ticket, try self.historyTicket())) return error.LayoutSourceChanged;
    }
    pub fn save(self: *const Session, a: std.mem.Allocator, options: SaveOptions) !Saved {
        try self.materializeLiveText();
        if (options.strict_layout) |request| {
            if (options.allow_stale_layout) return error.InvalidSavePolicy;
            try self.validateStrictLayoutOwner(request);
        }
        const state = self.stateConst();
        const created_resources = @import("created_cell_properties_resources.zig");
        const base_resource_changed = !state.chart_resources.empty() or state.document.bullet_resources.len != 0 or state.cell_backgrounds.entries.len != 0 or state.document.paragraph_resources.len != 0 or state.document.character_resources.len != 0 or state.document.font_resources.entries.items.len != 0;
        const resource_changed = base_resource_changed or created_resources.has(state.created_tables);
        var changed = resource_changed or options.strict_layout != null;
        for (state.document.sections, 0..) |section, index| {
            changed = changed or sectionChanged(state, index, section);
        }
        if (!changed) {
            if (state.source.file.bytes.len > options.max_output_bytes) return error.LimitExceeded;
            return .{ .bytes = try a.dupe(u8, state.source.file.bytes), .layout_requires_reflow = false };
        }
        if (!options.allow_stale_layout and options.strict_layout == null) return error.LayoutReflowRequired;
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const scratch = arena.allocator();
        var replacements: std.ArrayList(cfb.stream_replace.Replacement) = .empty;
        var cells = try self.cellResources(scratch);
        var generated: ?created_resources.Prepared = null;
        var created_info_changed = false;
        if (created_resources.has(state.created_tables)) {
            generated = try created_resources.prepare(scratch, cells.bytes, state.created_tables, state.source.header.version(), max_stream);
            created_info_changed = !std.mem.eql(u8, cells.bytes, generated.?.bytes);
            cells.bytes = generated.?.bytes;
        }
        var generated_limits = self.createdTableResources();
        if (generated) |value| generated_limits.border_count = value.border_count;
        if (options.strict_layout) |request| {
            if (!std.mem.eql(u8, request.snapshot.docinfo, cells.bytes)) return error.LayoutSourceChanged;
        }
        if (base_resource_changed or created_info_changed) {
            const encoded = if (state.source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(scratch, cells.bytes, max_stream) else cells.bytes;
            try replacements.append(scratch, .{ .path = "/DocInfo", .content = encoded });
        }
        for (state.document.sections, 0..) |section, index| {
            if (options.strict_layout == null and !cells.hasSection(index) and !sectionChanged(state, index, section)) continue;
            var structural = section.paragraphs.len != state.style_offsets[index].len;
            if (section.table_cell_sizes) |sizes| if (sizes.len != 0) {
                structural = true;
            };
            for (section.paragraphs) |p| if (p.source_node == null) {
                structural = true;
                break;
            };
            const form_source = if (section.form_values) |values|
                try @import("form_current_section.zig").writeAll(scratch, state.decoded[index], state.source.header.version(), values, max_stream)
            else
                state.decoded[index];
            const picture_source = if (section.picture_current_sizes) |sizes|
                try @import("picture_current_size_section.zig").writeAll(scratch, form_source, state.source.header.version(), sizes, max_stream)
            else
                form_source;
            const cell_source = if (cells.hasSection(index))
                try cells.writeSection(scratch, picture_source, state.source.header.version(), section, index, max_stream)
            else
                picture_source;
            const decoded = if (state.created_tables[index].entries.len != 0)
                try @import("created_table_section.zig").write(scratch, cell_source, section, if (generated) |*value| &value.tables[index] else &state.created_tables[index], state.source.header.version(), generated_limits, created_table_limits)
            else if (structural)
                try @import("structure_section_writer.zig").writeWithDeletions(scratch, cell_source, section, state.source.header.version(), self.characterShapeCount(), max_stream, true)
            else
                try @import("text_section_writer.zig").write(scratch, cell_source, section, state.source.header.version(), max_stream);
            const laid_out = if (options.strict_layout) |request|
                try @import("strict_plain_layout.zig").apply(scratch, request, decoded, state.source.header.version(), max_stream)
            else
                decoded;
            const distribution = state.source.header.has(.distribution);
            const path = try std.fmt.allocPrint(scratch, "/{s}/Section{d}", .{ if (distribution) "ViewText" else "BodyText", index });
            const encoded = if (distribution)
                try @import("../distribution/encode.zig").encodeCompressedLike(scratch, try state.source.file.readStream(scratch, path), laid_out, .{ .max_plaintext_bytes = max_stream, .max_output_bytes = options.max_output_bytes })
            else if (state.source.header.has(.compressed))
                try @import("../../compression/raw_deflate.zig").encodeStored(scratch, laid_out, max_stream)
            else
                laid_out;
            try replacements.append(scratch, .{ .path = path, .content = encoded });
        }
        return .{
            .bytes = try @import("../chart/created_resource_write.zig").rebuild(a, &state.source.file, replacements.items, state.chart_resources.entries, .{ .max_output_bytes = options.max_output_bytes }),
            .layout_requires_reflow = options.strict_layout == null,
        };
    }

    pub fn createdTableResources(self: *const Session) @import("created_table_records.zig").Resources {
        const state = self.stateConst();
        return .{ .paragraphs = .{ .char_shapes = self.characterShapeCount(), .para_shapes = self.paragraphShapeCount(), .styles = state.style_count }, .border_count = state.border_count };
    }

    /// Request-local ordinary source proof; caller destroys it before source or
    /// resource revision changes. No special-purpose dispatcher is granted.
    pub fn prepareIndependentSourceContext(self: *const Session, section: usize) !*@import("plain_text_source.zig").OrdinaryContext {
        return self.prepareIndependentSourceContextWith(section, null);
    }
    /// Lazily constructor-owned, request-only proof; caller destroys scope on
    /// every exit, before any source/lifetime change. No trusted success flag.
    pub fn prepareIndependentSourceContextScoped(self: *const Session, section: usize, scope: *?*@import("text_source_policy.zig").UnselectedContext) !*@import("plain_text_source.zig").OrdinaryContext {
        return self.prepareIndependentSourceContextWith(section, scope);
    }
    fn prepareIndependentSourceContextWith(self: *const Session, section: usize, scope: ?*?*@import("text_source_policy.zig").UnselectedContext) !*@import("plain_text_source.zig").OrdinaryContext {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        if (state.created_tables[section].entries.len != 0) return error.UnsupportedIndependentCreatedTableHost;
        const source = state.decoded[section];
        const version = state.source.header.version();
        if (try @import("company_source.zig").has(source) or try @import("source_policy.zig").hasNamedFields(source)) return error.UnsupportedIndependentTextPurpose;
        if (try @import("source_policy.zig").hasFormulas(state.allocator, source, version)) return error.UnsupportedIndependentTextPurpose;
        if (scope) |slot| {
            if (self.historyTransactionActive()) return error.MutationInProgress;
            const ticket = try self.historyTicket();
            if (slot.* == null) slot.* = try @import("text_source_policy.zig").UnselectedContext.prepareFirst(state.allocator, self, state.decoded, version, ticket, section);
            try slot.*.?.validate(self, state.decoded, version, ticket, section);
        } else try @import("text_source_policy.zig").validateUnselected(state.allocator, state.decoded, version, section);
        return @import("plain_text_source.zig").OrdinaryContext.create(state.allocator, source, version, self.characterShapeCount());
    }

    /// Readonly semantic dry-run on this target only. Current identity, actual
    /// length, controls, expected text, runs and default range guards stay live.
    pub fn validateIndependentTextTarget(self: *const Session, context: *@import("plain_text_source.zig").OrdinaryContext, section: usize, paragraph_index: usize, before_units: u32, edits: []const @import("../../model/independent_text_edits.zig").Edit) !void {
        try self.materializeLiveText();
        const state = self.stateConst();
        if (paragraph_index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        if (state.created_tables[section].entries.len != 0) return error.UnsupportedIndependentCreatedTableHost;
        if (before_units != try self.editableTextLength(state.allocator, section, paragraph_index)) return error.TextTransactionBeforeMismatch;
        const current = try self.currentSourceParagraphReference(section, paragraph_index);
        if (current != .source or current.source.section != section) return error.SourceBindingMismatch;
        const p = state.document.sections[section].paragraphs[paragraph_index];
        if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedIndependentTextPurpose;
        for (p.tokens) |token| if (token.kind == .control and token.raw.len >= 2) {
            const code = std.mem.readInt(u16, token.raw[0..2], .little);
            if (code == 3 or code == 4) return error.UnsupportedIndependentTextPurpose;
        };
        var draft = try @import("../../model/clone.zig").paragraph(state.allocator, p);
        defer draft.deinit(state.allocator);
        _ = try @import("plain_text.zig").applyIndependentScoped(state.allocator, context, state.decoded[section], state.source.header.version(), &draft, edits, self.characterShapeCount(), .{});
    }

    fn getState(self: *Session) *State {
        return @ptrCast(@alignCast(self));
    }
    fn stateConst(self: *const Session) *const State {
        return @ptrCast(@alignCast(self));
    }
};

fn sectionChanged(state: *const State, index: usize, section: model.Section) bool {
    if (section.rebased_source != null) return true;
    if (section.form_values) |values| if (values.len != 0) return true;
    if (state.created_tables[index].entries.len != 0) return true;
    if (section.picture_current_sizes) |sizes| if (sizes.len != 0) return true;
    if (section.table_cell_sizes) |sizes| if (sizes.len != 0) return true;
    if (section.paragraphs.len != state.style_offsets[index].len) return true;
    for (section.paragraphs, state.style_offsets[index]) |p, offset| {
        if (p.style_id != state.decoded[index][offset] or p.range_tags != null or p.field_attributes != null) return true;
        const shape_offset = offset - (Header.style_id_offset - Header.para_shape_id_offset);
        if (p.para_shape_id != std.mem.readInt(u16, state.decoded[index][shape_offset..][0..2], .little)) return true;
    }
    return false;
}

const LiveIdentityForTest = struct { incarnation: u64, has_backing: bool };
// 테스트에서만 scalar identity를 관측한다. State/토큰/버퍼 주소를 내보내지 않는다.
pub const Testing = if (@import("builtin").is_test) struct {
    pub fn liveIdentity(session: *const Session) LiveIdentityForTest {
        const state = session.stateConst();
        return .{ .incarnation = state.live_incarnation, .has_backing = state.live_text != null };
    }
} else struct {};
