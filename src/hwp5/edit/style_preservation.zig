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
    stage_table: @import("created_table_stage.zig").Edit,
    set_created_cell_text: @import("created_cell_text.zig").Edit,
    splice_current_paragraph: @import("current_paragraph_edit.zig").Splice,
    set_style: struct { section: usize, paragraph: usize, style_id: u8 },
    insert_text: struct { section: usize, paragraph: usize, utf8: []const u8 },
    delete_paragraph: struct { section: usize, paragraph: usize },
    splice_text: TextSplice,
    set_character_format: CharacterFormat,
    set_character_properties: @import("character_property_apply.zig").Edit,
    set_character_font_name: struct { section: usize, paragraph: usize, start_unit: u32, end_unit: u32, language: @import("../../model/character_fonts.zig").Language, name: []const u8 },
    split_paragraph: @import("structure_session.zig").Split,
    merge_paragraph: @import("merge_session.zig").Merge,
    set_cell_size: @import("table_cell_size_values.zig").Edit,
    set_picture_current_size: @import("picture_current_size_values.zig").Edit,
    resize_picture: @import("picture_resize_values.zig").Edit,
    set_paragraph_format: @import("paragraph_format.zig").Edit,
    set_paragraph_alignment: struct { section: usize, paragraph: usize, alignment: u32 },
    set_paragraph_margins: struct { section: usize, paragraph: usize, margins: model.ParagraphMarginPatch },
    set_paragraph_spacing: struct { section: usize, paragraph: usize, spacing: model.ParagraphSpacing },
    set_formula_definition: @import("formula_definition.zig").Edit,
    set_form_text: @import("form_text_apply.zig").Edit,
    set_form_choice: @import("form_choice_apply.zig").Edit,
    select_form_radio: @import("form_radio_apply.zig").Edit,
};
pub const SaveOptions = struct {
    /// Byte-preservation experiments only; does not certify Hancom layout.
    allow_stale_layout: bool = false,
    max_output_bytes: usize = max_bytes,
};
pub const Saved = struct { bytes: []u8, layout_requires_reflow: bool };
pub const Checkpoint = @import("table_checkpoint.zig").Checkpoint;

// Allocated once; the public opaque pointer prevents direct model/sidecar writes.
const State = struct {
    allocator: std.mem.Allocator,
    source: Source,
    decoded: [][]u8,
    document: model.Document,
    created_tables: []@import("created_table_values.zig").Values,
    style_offsets: [][]usize,
    style_count: usize,
    char_count: usize,
    para_count: usize,
    border_count: usize,
    memo_shape_count: usize,
    observed_docinfo: ?@import("observed_docinfo.zig").Diagnostics = null,

    fn deinit(self: *State) void {
        const a = self.allocator;
        for (self.style_offsets) |offsets| a.free(offsets);
        a.free(self.style_offsets);
        self.document.deinit(a);
        for (self.created_tables) |*tables| tables.deinit(a);
        a.free(self.created_tables);
        for (self.decoded) |bytes| a.free(bytes);
        a.free(self.decoded);
        self.source.deinit();
    }
};

pub const Session = opaque {
    /// 저장 모델을 변경하지 않고 원본 문단 토큰과 빈 본문 여부를 관찰합니다.
    pub fn displayTextPresence(self: *const Session, section: usize, index: usize) !struct { source_node: ?u32, declared_units: usize, token_count: usize, raw_units: usize, observed_empty: bool } {
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
        return self.planTableIdsWithAllocator(self.stateConst().allocator, cells);
    }

    pub fn planTableIdsWithAllocator(self: *const Session, allocator: std.mem.Allocator, cells: usize) !@import("created_table_ids.zig").Plan {
        if (cells > created_table_limits.max_cells) return error.LimitExceeded;
        const state = self.stateConst();
        return @import("created_table_ids.zig").plan(allocator, state.decoded, state.source.header.version(), &state.document, state.created_tables, cells, 2_000_000);
    }

    pub fn pendingTableCount(self: *const Session, section: usize) !usize {
        const state = self.stateConst();
        if (section >= state.created_tables.len) return error.InvalidSection;
        return state.created_tables[section].entries.len;
    }

    pub fn createdTables(self: *const Session, allocator: std.mem.Allocator, section: usize) ![]@import("created_table_snapshot.zig").Row {
        const state = self.stateConst();
        if (section >= state.created_tables.len) return error.InvalidSection;
        return @import("created_table_snapshot.zig").read(allocator, &state.document.sections[section], &state.created_tables[section]);
    }

    pub fn currentTextPreview(self: *const Session, allocator: std.mem.Allocator) ![]u8 {
        return @import("current_text_preview.zig").encode(allocator, &self.stateConst().document, self.fileVersion());
    }

    pub fn copyCreatedCellUtf8(self: *const Session, a: std.mem.Allocator, point: @import("created_cell_text.zig").Point) ![]u8 {
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
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("created_table_paragraphs.zig").build(a, state.decoded[section], &state.document.sections[section], &state.created_tables[section], state.source.header.version(), section, limit);
    }

    pub fn copyCurrentParagraphTextUtf16(self: *const Session, a: std.mem.Allocator, section: usize, reference: @import("created_table_paragraphs.zig").Reference) ![]u8 {
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
        return self.applyBatchCheckpointed(checkpoint, limit, &.{command});
    }

    pub fn applyBatchCheckpointed(self: *Session, checkpoint: *Checkpoint, limit: usize, commands: []const Command) !bool {
        if (!try self.matchesCheckpoint(checkpoint)) return error.SourceBindingMismatch;
        for (commands) |command| self.apply(command) catch |err| {
            const state = self.getState();
            try @import("table_checkpoint.zig").rollback(checkpoint, state.allocator, self, &state.document, &state.created_tables);
            return err;
        };
        if (try self.matchesCheckpoint(checkpoint)) return false;
        _ = self.checkpointSize(limit) catch |err| {
            const state = self.getState();
            try @import("table_checkpoint.zig").rollback(checkpoint, state.allocator, self, &state.document, &state.created_tables);
            return err;
        };
        return true;
    }

    pub fn matchesCheckpoint(self: *const Session, checkpoint: *const Checkpoint) !bool {
        const state = self.stateConst();
        return @import("table_checkpoint.zig").matches(checkpoint, state.allocator, self, &state.document, state.created_tables);
    }

    pub fn checkpointSize(self: *const Session, limit: usize) !usize {
        return @import("table_checkpoint.zig").size(&self.stateConst().document, self.stateConst().created_tables, limit);
    }

    pub fn createCheckpoint(self: *const Session, max_checkpoint_bytes: usize) !*Checkpoint {
        const state = self.stateConst();
        return @import("table_checkpoint.zig").capture(state.allocator, self, &state.document, state.created_tables, max_checkpoint_bytes);
    }

    /// V2 history storage only. The returned values may not be exchanged into live state.
    pub fn createHistoryCheckpointIn(self: *const Session, storage: std.mem.Allocator, limit: usize) !*Checkpoint {
        const state = self.stateConst();
        return @import("table_checkpoint.zig").capture(storage, self, &state.document, state.created_tables, limit);
    }
    pub fn cloneHistoryCheckpointForRestore(self: *const Session, checkpoint: *const Checkpoint, limit: usize) !*Checkpoint {
        return @import("table_checkpoint.zig").cloneTo(checkpoint, self.stateConst().allocator, self, limit);
    }
    pub fn rollbackHistoryCheckpoint(self: *Session, checkpoint: *Checkpoint) !void {
        const state = self.getState();
        try @import("table_checkpoint.zig").rollback(checkpoint, state.allocator, self, &state.document, &state.created_tables);
    }

    pub fn restoreCheckpoint(self: *Session, checkpoint: *Checkpoint) !void {
        const state = self.getState();
        try @import("table_checkpoint.zig").exchange(checkpoint, state.allocator, self, &state.document, &state.created_tables);
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
        const owned = try a.create(State);
        owned.* = .{ .allocator = a, .source = source, .decoded = decoded, .document = document, .created_tables = created_tables, .style_offsets = offsets, .style_count = style_count, .char_count = resources.count(.char_shape), .para_count = resources.count(.para_shape), .border_count = resources.count(.border_fill), .memo_shape_count = resources.memo_shape_count };
        owned.observed_docinfo = observed;
        return @ptrCast(owned);
    }

    pub fn close(self: *Session) void {
        const state = self.getState();
        const a = state.allocator;
        state.deinit();
        a.destroy(state);
    }

    pub fn sectionCount(self: *const Session) usize {
        return self.stateConst().document.sections.len;
    }

    pub fn characterShapeCount(self: *const Session) usize {
        return self.stateConst().char_count + self.stateConst().document.character_resources.len;
    }
    pub fn paragraphShapeCount(self: *const Session) usize {
        return self.stateConst().para_count + self.stateConst().document.paragraph_resources.len;
    }
    pub fn ensureFont(self: *Session, language: @import("../../model/character_fonts.zig").Language, name: []const u8) !u32 {
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
        var candidate = state.document;
        candidate.font_resources = pending;
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const verified = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &candidate, state.para_count, state.char_count, max_stream);
        defer a.free(verified);
        std.mem.swap(@import("../../model/font_resource_values.zig").Values, &state.document.font_resources, &pending);
        return count;
    }
    pub fn paragraphShapeId(self: *const Session, section: usize, paragraph_index: usize) !u16 {
        if (paragraph_index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        return self.stateConst().document.sections[section].paragraphs[paragraph_index].para_shape_id;
    }
    pub fn tableBindings(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_display_bindings.zig").Binding {
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
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_display_placements.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn tableLayoutSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_layout_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_layout_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn captionSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("caption_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("caption_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("form_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("form_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formProperties(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("form_property_snapshot.zig").Row {
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
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("form_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn drawingSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_sources.zig").Source {
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
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_object_extras.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn formulaSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("formula_snapshot.zig").Row {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("formula_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    pub fn fieldSpans(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("field_span_snapshot.zig").Row {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("field_span_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    /// Marker diagnostics only, not field-header binding or edit admission.
    pub fn fieldTopology(self: *const Session, a: std.mem.Allocator, section: usize) !@import("local_field_spans.zig").Report {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("local_field_spans.zig").inspectReadableBound(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    pub fn drawingComponentSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_component_sources.zig").Source {
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
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn drawingListSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_list_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_list_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn drawingMatrixSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_matrix_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_matrix_sources.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingLocalTransforms(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_local_transforms.zig").Transform {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_local_transforms.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingRectangleCorners(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_rectangle_corners.zig").Corners {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_rectangle_corners.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    pub fn drawingPolygonPoints(self: *const Session, a: std.mem.Allocator, section: usize, layout: @import("../body/shape_polygon.zig").Layout) ![]@import("drawing_polygon_points.zig").Polygon {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_polygon_points.zig").read(a, current orelse state.decoded[section], state.source.header.version(), layout);
    }
    pub fn drawingCurvePoints(self: *const Session, a: std.mem.Allocator, section: usize, layout: @import("../body/shape_curve.zig").Layout) ![]@import("drawing_curve_points.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_curve_points.zig").read(a, current orelse state.decoded[section], state.source.header.version(), layout);
    }
    pub fn drawingLineEndpoints(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("drawing_line_endpoints.zig").Endpoints {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const current = try self.currentDrawingSection(a, section);
        defer if (current) |bytes| a.free(bytes);
        return @import("drawing_line_endpoints.zig").read(a, current orelse state.decoded[section], state.source.header.version());
    }
    fn currentDrawingSection(self: *const Session, a: std.mem.Allocator, section: usize) !?[]u8 {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        const sizes = state.document.sections[section].picture_current_sizes orelse return null;
        return try @import("picture_current_size_section.zig").writeAll(a, state.decoded[section], state.source.header.version(), sizes, max_stream);
    }
    /// Owned rows and gradient arrays; release with drawing_style_sources.deinit.
    pub fn drawingStyleSources(self: *const Session, a: std.mem.Allocator, section: usize, options: @import("../body/drawing_style_validation.zig").Options) ![]@import("drawing_style_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("drawing_style_sources.zig").read(a, state.decoded[section], state.source.header.version(), options);
    }
    pub fn fileVersion(self: *const Session) u32 {
        return self.stateConst().source.header.version().raw;
    }
    pub fn pictureSources(self: *const Session, a: std.mem.Allocator, section: usize, prefix: @import("../body/shape_picture.zig").Prefix) ![]@import("picture_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("picture_sources.zig").read(a, state.decoded[section], state.source.header.version(), prefix);
    }
    /// Decoded internal resource bytes; caller frees them. Never resolves external paths.
    pub fn binaryResource(self: *const Session, a: std.mem.Allocator, ordinal: u16, limit: usize) ![]u8 {
        return @import("binary_resource.zig").read(a, &self.stateConst().source, ordinal, limit);
    }
    pub fn pictureTailSources(self: *const Session, a: std.mem.Allocator, section: usize, additional: ?@import("../body/picture_additional.zig").Layout) ![]@import("picture_tail_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("picture_tail_sources.zig").read(a, state.decoded[section], state.source.header.version(), additional);
    }
    pub fn cellLayoutSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("cell_layout_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("cell_layout_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn tableAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("table_anchor_positions.zig").Anchor {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("table_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn structuralAnchors(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("structural_anchor_positions.zig").Anchor {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("structural_anchor_positions.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn noteShapeSources(self: *const Session, a: std.mem.Allocator, section: usize) ![2]@import("note_shape_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("note_shape_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn noteSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("note_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("note_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn automaticNumberSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("automatic_number_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("automatic_number_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn pageControlSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("page_control_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_control_sources.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section].paragraphs);
    }
    pub fn documentProperties(self: *const Session, a: std.mem.Allocator) !@import("document_properties_snapshot.zig").Snapshot {
        const state = self.stateConst();
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        return @import("document_properties_snapshot.zig").read(decoded, state.source.header.version());
    }
    pub fn masterPageSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("master_page_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("master_page_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn pageAreaSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("page_area_sources.zig").Source {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_area_sources.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn pageSettings(self: *const Session, a: std.mem.Allocator, section: usize) !@import("page_settings_snapshot.zig").Setting {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("page_settings_snapshot.zig").read(a, state.decoded[section], state.source.header.version());
    }
    pub fn sectionSettings(self: *const Session, a: std.mem.Allocator, section: usize) !@import("section_settings_snapshot.zig").Setting {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        var setting = try @import("section_settings_snapshot.zig").read(a, state.decoded[section], state.source.header.version());
        setting.memo_shape_count = state.memo_shape_count;
        return setting;
    }
    pub fn paragraphFlow(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("paragraph_flow_snapshot.zig").Flow {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("paragraph_flow_snapshot.zig").read(a, state.decoded[section], state.source.header.version(), state.document.sections[section]);
    }
    /// Caller releases the owned declaration array with column_sources_snapshot.free.
    pub fn columnSources(self: *const Session, a: std.mem.Allocator, section: usize) ![]@import("column_sources_snapshot.zig").Declaration {
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
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const state = self.stateConst();
        return @import("character_display_ranges.zig").read(a, state.document.sections[section].paragraphs[index], self.characterShapeCount());
    }

    /// Caller-owned scalar snapshot, never a second mutable resource model.
    pub fn fontFaces(self: *const Session, a: std.mem.Allocator) ![]@import("../../model/font_face_value.zig").Value {
        return self.fontSnapshot(a, false);
    }

    pub fn fontFaceMetadata(self: *const Session, a: std.mem.Allocator) ![]@import("font_face_snapshot.zig").Metadata {
        return self.fontSnapshot(a, true);
    }

    /// Current DocInfo resources; caller owns the rows and gradient arrays.
    pub fn borderFillSources(self: *const Session, a: std.mem.Allocator) ![]@import("border_fill_sources.zig").Source {
        const state = self.stateConst();
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &state.document, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        return @import("border_fill_sources.zig").read(a, current, state.source.header.version(), 1_000_000);
    }

    fn fontSnapshot(self: *const Session, a: std.mem.Allocator, comptime metadata: bool) ![]if (metadata) @import("font_face_snapshot.zig").Metadata else @import("../../model/font_face_value.zig").Value {
        const state = self.stateConst();
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &state.document, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        const snapshot = @import("font_face_snapshot.zig");
        return if (metadata) snapshot.readMetadata(a, current, state.source.header.version(), 1_000_000, 4096) else snapshot.read(a, current, state.source.header.version(), 1_000_000, 4096);
    }

    /// Caller-owned scalar snapshot, never a second mutable resource model.
    pub fn characterShapes(self: *const Session, a: std.mem.Allocator) ![]@import("character_display_shapes.zig").Shape {
        const state = self.stateConst();
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &state.document, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        return @import("character_display_shapes.zig").read(a, current, state.source.header.version(), self.characterShapeCount());
    }

    /// Caller owns the immutable resource snapshot.
    pub fn paragraphShapes(self: *const Session, a: std.mem.Allocator) ![]@import("paragraph_display_shapes.zig").Shape {
        const state = self.stateConst();
        const decoded = try state.source.decodeDocInfo(a, max_stream);
        defer a.free(decoded);
        const current = try @import("resource_docinfo.zig").write(a, decoded, state.source.header.version(), &state.document, state.para_count, state.char_count, max_stream);
        defer a.free(current);
        return @import("paragraph_display_shapes.zig").read(a, current, state.source.header.version(), self.paragraphShapeCount());
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
        const state = self.stateConst();
        try @import("text_source_policy.zig").validate(state.allocator, state.decoded, state.source.header.version(), section);
    }
    pub fn textSourceProtection(self: *const Session, a: std.mem.Allocator, section: usize) !@import("text_source_protection.zig").Snapshot {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return @import("text_source_protection.zig").read(a, state.decoded, state.source.header.version(), section, state.document.sections[section]);
    }

    pub fn editableTextLength(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) !u32 {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const paragraph_value = self.stateConst().document.sections[section].paragraphs[index];
        const bytes = try @import("plain_text_content.zig").editableTextBytes(a, paragraph_value);
        defer a.free(bytes);
        if (bytes.len < 2 or bytes.len % 2 != 0 or std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
        return std.math.cast(u32, bytes.len / 2 - 1) orelse error.LimitExceeded;
    }

    /// Owned UTF-16LE token bytes, including the original paragraph terminator.
    pub fn copyText(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) ![]u8 {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        return @import("plain_text.zig").textBytes(a, self.stateConst().document.sections[section].paragraphs[index]);
    }

    pub fn apply(self: *Session, command: Command) !void {
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
                        const before = try self.copyCreatedCellUtf8(state.allocator, point);
                        defer state.allocator.free(before);
                        const next = try @import("../../text/utf8_utf16_splice.zig").replace(state.allocator, before, edit.start_unit, edit.end_unit, edit.utf8, max_stream);
                        defer state.allocator.free(next);
                        return self.apply(.{ .set_created_cell_text = .{ .point = point, .utf8 = next } });
                    },
                }
            },
            .stage_table => |edit| {
                const state = self.getState();
                try @import("created_table_stage.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
            },
            .set_created_cell_text => |edit| {
                const state = self.getState();
                try @import("created_cell_text.zig").apply(state.allocator, state.decoded, &state.document, state.created_tables, state.source.header.version(), edit, self.createdTableResources(), created_table_limits);
            },
            .set_character_font_name => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                try @import("../../model/font_name.zig").validate(edit.name, 4096);
                if (edit.start_unit == edit.end_unit) return self.apply(.{ .set_character_properties = .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = edit.start_unit, .end_unit = edit.end_unit, .properties = .{} } });
                const state = self.getState();
                const checkpoint = try self.createCheckpoint(max_bytes);
                defer checkpoint.deinit();
                errdefer @import("table_checkpoint.zig").rollback(checkpoint, state.allocator, self, &state.document, &state.created_tables) catch unreachable;
                const id = try self.ensureFont(edit.language, edit.name);
                var ids: @import("../../model/character_fonts.zig").Values = @splat(null);
                ids[@backingInt(edit.language)] = id;
                try self.apply(.{ .set_character_properties = .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = edit.start_unit, .end_unit = edit.end_unit, .properties = .{ .font_ids = ids } } });
            },
            .set_paragraph_spacing => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const decoded = try state.source.decodeDocInfo(a, max_stream);
                defer a.free(decoded);
                try @import("paragraph_alignment_apply.zig").applyWithProperties(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, null, .{}, edit.spacing, max_stream);
            },
            .set_paragraph_margins => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const decoded = try state.source.decodeDocInfo(a, max_stream);
                defer a.free(decoded);
                try @import("paragraph_alignment_apply.zig").applyWithMargins(a, &state.document, decoded, state.source.header.version(), state.para_count, edit.section, edit.paragraph, null, edit.margins, max_stream);
            },
            .set_paragraph_alignment => |edit| {
                if (edit.alignment > 5) return error.InvalidParagraphAlignment;
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                const a = state.allocator;
                const decoded = try state.source.decodeDocInfo(a, max_stream);
                defer a.free(decoded);
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
            .set_character_properties => |edit| {
                const state = self.getState();
                if (edit.section >= state.document.sections.len) return error.InvalidSection;
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("source_policy.zig").validateUnselectedCharacterFormat(state.allocator, bytes, state.source.header.version());
                }
                const info = try state.source.decodeDocInfo(state.allocator, max_stream);
                defer state.allocator.free(info);
                try @import("character_property_apply.zig").apply(state.allocator, state.decoded[edit.section], info, state.source.header.version(), &state.document, edit, state.char_count, max_stream);
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

    pub fn save(self: *const Session, a: std.mem.Allocator, options: SaveOptions) !Saved {
        const state = self.stateConst();
        const resource_changed = state.document.paragraph_resources.len != 0 or state.document.character_resources.len != 0 or state.document.font_resources.entries.items.len != 0;
        var changed = resource_changed;
        for (state.document.sections, 0..) |section, index| {
            changed = changed or sectionChanged(state, index, section);
        }
        if (!changed) {
            if (state.source.file.bytes.len > options.max_output_bytes) return error.LimitExceeded;
            return .{ .bytes = try a.dupe(u8, state.source.file.bytes), .layout_requires_reflow = false };
        }
        if (!options.allow_stale_layout) return error.LayoutReflowRequired;
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const scratch = arena.allocator();
        var replacements: std.ArrayList(cfb.stream_replace.Replacement) = .empty;
        if (resource_changed) {
            const decoded = try state.source.decodeDocInfo(scratch, max_stream);
            const current = try @import("resource_docinfo.zig").write(scratch, decoded, state.source.header.version(), &state.document, state.para_count, state.char_count, max_stream);
            const encoded = if (state.source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(scratch, current, max_stream) else current;
            try replacements.append(scratch, .{ .path = "/DocInfo", .content = encoded });
        }
        for (state.document.sections, 0..) |section, index| {
            if (!sectionChanged(state, index, section)) continue;
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
            const decoded = if (state.created_tables[index].entries.len != 0)
                try @import("created_table_section.zig").write(scratch, picture_source, section, &state.created_tables[index], state.source.header.version(), self.createdTableResources(), created_table_limits)
            else if (structural)
                try @import("structure_section_writer.zig").writeWithDeletions(scratch, picture_source, section, state.source.header.version(), self.characterShapeCount(), max_stream, true)
            else
                try @import("text_section_writer.zig").write(scratch, picture_source, section, state.source.header.version(), max_stream);
            const distribution = state.source.header.has(.distribution);
            const path = try std.fmt.allocPrint(scratch, "/{s}/Section{d}", .{ if (distribution) "ViewText" else "BodyText", index });
            const encoded = if (distribution)
                try @import("../distribution/encode.zig").encodeCompressedLike(scratch, try state.source.file.readStream(scratch, path), decoded, .{ .max_plaintext_bytes = max_stream, .max_output_bytes = options.max_output_bytes })
            else if (state.source.header.has(.compressed))
                try @import("../../compression/raw_deflate.zig").encodeStored(scratch, decoded, max_stream)
            else
                decoded;
            try replacements.append(scratch, .{ .path = path, .content = encoded });
        }
        return .{
            .bytes = try cfb.stream_replace.rebuildManyExact(a, &state.source.file, replacements.items, .{ .max_output_bytes = options.max_output_bytes }),
            .layout_requires_reflow = true,
        };
    }

    pub fn createdTableResources(self: *const Session) @import("created_table_records.zig").Resources {
        const state = self.stateConst();
        return .{ .paragraphs = .{ .char_shapes = self.characterShapeCount(), .para_shapes = self.paragraphShapeCount(), .styles = state.style_count }, .border_count = state.border_count };
    }

    fn getState(self: *Session) *State {
        return @ptrCast(@alignCast(self));
    }
    fn stateConst(self: *const Session) *const State {
        return @ptrCast(@alignCast(self));
    }
};

fn sectionChanged(state: *const State, index: usize, section: model.Section) bool {
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
