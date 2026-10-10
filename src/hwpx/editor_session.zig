//! Owned document session: orchestration only, no duplicated XML or ZIP parser.
const std = @import("std");
const package = @import("package.zig");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const scanner = @import("section_text.zig");
const zip_writer = @import("../zip/replace_writer.zig");

pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_xml_bytes: usize = 128 * 1024 * 1024,
    max_text_bytes: usize = 64 * 1024 * 1024,
    max_sites: usize = 1_000_000,
    max_sections: usize = 4096,
};
pub const Section = struct {
    tree: tree_module.Tree,
    sites: sites_module.Sites,
    /// When present this owns current text; sites must be empty, never a cache.
    structure_values: ?@import("paragraph_structure_values.zig").Values = null,
    locations: []scanner.Location,
    entry_index: usize,
    first_paragraph: usize,
    source_first_paragraph: ?usize = null,
    last_paragraph: usize,
    field_dirty: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .empty,
    cell_sizes: @import("table_cell_size_values.zig").Values = .empty,
    picture_dimensions: @import("picture_dimension_edit_values.zig").Values = .empty,
    picture_matrices: @import("picture_matrix_edit_values.zig").Values = .empty,
    checkbox_states: @import("form_checkbox_state_values.zig").Values = .empty,
    formula_definitions: @import("formula_definition_values.zig").Values = .{},
    created_tables: @import("created_table_values.zig").Values = .{},
    pub fn sourceParagraph(self: *const Section, paragraph: usize) !usize {
        if (paragraph < self.first_paragraph or paragraph > self.last_paragraph) return error.InvalidParagraphIndex;
        if (self.structure_values != null) return error.UnsupportedStructuralFieldEdit;
        return std.math.add(usize, self.source_first_paragraph orelse self.first_paragraph, paragraph - self.first_paragraph) catch error.InvalidParagraphIndex;
    }
    pub fn textBytes(self: *const Section, limit: usize) !usize {
        var bytes: usize = 0;
        if (self.structure_values) |values| {
            if (self.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            for (values.paragraphs) |paragraph| for (paragraph.sites.items) |site| {
                if (site.text.len > limit -| bytes) return error.LimitExceeded;
                bytes += site.text.len;
            };
        } else for (self.sites.items) |site| {
            if (site.text.len > limit -| bytes) return error.LimitExceeded;
            bytes += site.text.len;
        }
        return bytes;
    }
    fn deinit(self: *Section, a: std.mem.Allocator) void {
        if (self.structure_values) |*values| values.deinit(a);
        self.field_dirty.deinit(a);
        self.cell_sizes.deinit(a);
        self.picture_dimensions.deinit(a);
        self.picture_matrices.deinit(a);
        self.checkbox_states.deinit(a);
        self.formula_definitions.deinit(a);
        self.created_tables.deinit(a);
        a.free(self.locations);
        self.sites.deinit(a);
        self.tree.deinit(a);
    }
};
pub const Session = struct {
    allocator: std.mem.Allocator,
    source: []u8,
    sections: []Section,
    options: Options,
    source_fields: ?@import("source_field_analysis.zig").Source = null,
    paragraph_resources: @import("paragraph_resource_values.zig").Values = .{},
    character_resources: @import("character_resource_values.zig").Values = .{},
    font_resources: @import("../model/font_resource_values.zig").Values = .{},

    pub fn deinit(self: *Session) void {
        if (self.source_fields) |*fields| fields.deinit(self.allocator);
        self.paragraph_resources.deinit(self.allocator);
        self.character_resources.deinit(self.allocator);
        self.font_resources.deinit(self.allocator);
        for (self.sections) |*section| section.deinit(self.allocator);
        self.allocator.free(self.sections);
        self.allocator.free(self.source);
        self.* = undefined;
    }

    pub fn setParagraphMargins(self: *Session, section: usize, paragraph: usize, margins: @import("paragraph_margin_patch.zig").Patch) !bool {
        return @import("paragraph_alignment_session.zig").applyWithMargins(self, section, paragraph, null, margins);
    }
    pub fn setParagraphSpacing(self: *Session, section: usize, paragraph: usize, spacing: @import("paragraph_spacing_patch.zig").Spacing) !bool {
        return @import("paragraph_alignment_session.zig").applyWithProperties(self, section, paragraph, null, .{}, spacing);
    }
    pub fn setParagraphAlignment(self: *Session, section: usize, paragraph: usize, alignment: @import("paragraph_resource_clone.zig").Alignment) !bool {
        return @import("paragraph_alignment_session.zig").apply(self, section, paragraph, alignment);
    }

    pub fn splice(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        return self.spliceMode(section_index, paragraph, start, deleted, inserted, false);
    }

    pub fn splitParagraph(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
        try self.requireMutableHostPositions();
        return @import("paragraph_split_session.zig").split(self, section_index, paragraph, start, deleted);
    }

    pub fn canSplitParagraph(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
        self.requireMutableHostPositions() catch return false;
        return @import("paragraph_split_session.zig").canSplit(self, section_index, paragraph, start, deleted);
    }

    pub fn splitParagraphAnchored(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
        try self.requireMutableHostPositions();
        return @import("paragraph_split_session.zig").splitAnchored(self, section_index, paragraph, start, deleted);
    }

    pub fn mergeParagraph(self: *Session, section_index: usize, paragraph: usize) !bool {
        try self.requireMutableHostPositions();
        return @import("paragraph_merge_session.zig").merge(self, section_index, paragraph);
    }

    pub fn mergeParagraphPair(self: *Session, section_index: usize, paragraph: usize, right: usize) !bool {
        try self.requireMutableHostPositions();
        return @import("paragraph_merge_session.zig").mergePair(self, section_index, paragraph, right);
    }

    pub fn setCharacterFormat(self: *Session, section_index: usize, paragraph: usize, start: u32, end: u32, id: u32) !bool {
        return @import("character_style_session.zig").apply(self, section_index, paragraph, start, end, id);
    }

    pub fn setCharacterProperties(self: *Session, section_index: usize, paragraph: usize, start: u32, end: u32, properties: @import("../model/document.zig").CharacterPropertyPatch) !bool {
        return @import("character_property_session.zig").apply(self, section_index, paragraph, start, end, properties);
    }
    pub fn setCharacterFontName(self: *Session, section_index: usize, paragraph: usize, start: u32, end: u32, language: @import("font_faces.zig").Language, name: []const u8) !bool {
        return @import("font_creation.zig").apply(self, section_index, paragraph, start, end, language, name);
    }

    pub fn paragraphShapeIds(self: *const Session) ![]u32 {
        return @import("paragraph_style_resources.zig").ids(self);
    }
    pub fn paragraphShapes(self: *const Session) ![]@import("paragraph_display_owned.zig").Shape {
        return @import("paragraph_display_resources.zig").read(self);
    }
    pub fn paragraphShapeId(self: *const Session, section: usize, paragraph: usize) !u32 {
        return @import("paragraph_format_session.zig").currentId(self, section, paragraph);
    }
    pub fn setParagraphFormat(self: *Session, section: usize, paragraph: usize, id: u32) !bool {
        return @import("paragraph_format_session.zig").apply(self, section, paragraph, id);
    }

    pub fn spliceAnchored(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        return self.spliceMode(section_index, paragraph, start, deleted, inserted, true);
    }

    fn spliceMode(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        for (self.sections) |section| if (section.created_tables.entries.items.len != 0) return @import("created_table_host_splice.zig").apply(self, section_index, paragraph, start, deleted, inserted, anchored, spliceModeUntracked);
        return self.spliceModeUntracked(section_index, paragraph, start, deleted, inserted, anchored);
    }

    fn spliceModeUntracked(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool) anyerror!bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const selected = &self.sections[section_index];
        if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
        if (anchored and selected.structure_values == null) {
            const field_positions = try @import("field_source_outside_positions.zig").prepareAction(self, section_index, paragraph, 0, 0, .whole_anchored);
            if (field_positions) |positions| self.allocator.free(positions);
        }
        var other_bytes: usize = 0;
        for (self.sections, 0..) |section, index| {
            if (index == section_index) continue;
            other_bytes += try section.textBytes(self.options.max_text_bytes -| other_bytes);
        }
        if (selected.structure_values) |*values| {
            if (!anchored and try @import("formula_section_save.zig").hasFormula(self.allocator, &selected.tree)) {
                if (try @import("structural_formula_exterior.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes -| other_bytes)) |changed| return changed;
            }
            const index = paragraph - selected.first_paragraph;
            if (index < values.paragraphs.len and values.paragraphs[index].field_positions != null) return @import("field_outside_session.zig").splice(self, section_index, index, start, deleted, inserted, self.options.max_text_bytes -| other_bytes);
            if (selected.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            if (try @import("formula_section_save.zig").hasFormula(self.allocator, &selected.tree)) return @import("paragraph_structure_formula_splice.zig").splice(self, section_index, paragraph - selected.first_paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored);
            if (values.paragraphs[paragraph - selected.first_paragraph].column_boundaries == null) {
                if (try @import("column_boundary_session.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored)) |changed| return changed;
            }
            return @import("paragraph_structure_splice.zig").spliceMode(self.allocator, &selected.tree, values, paragraph - selected.first_paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored);
        }
        if (try @import("formula_section_save.zig").hasFormula(self.allocator, &selected.tree)) {
            if (!anchored) {
                if (try @import("field_source_outside_session.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes)) |changed| return changed;
            }
            const trees = try self.allocator.alloc(tree_module.Tree, self.sections.len);
            defer self.allocator.free(trees);
            for (self.sections, trees) |section, *tree| tree.* = section.tree;
            return @import("formula_splice.zig").spliceWithDefinitions(self.allocator, trees, section_index, &selected.sites, selected.locations, try selected.sourceParagraph(paragraph), start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored, &selected.formula_definitions);
        }
        const source_paragraph = try selected.sourceParagraph(paragraph);
        // 필드 외부의 검증된 범위를 일반 문단/쪽 선언 정책이 먼저 거부하지 않도록 합니다.
        if (!anchored) if (try @import("field_source_outside_session.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes)) |changed| return changed;
        if (try @import("page_area_source_session.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored)) |changed| return changed;
        if (try @import("column_boundary_session.zig").splice(self, section_index, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored)) |changed| return changed;
        if (anchored) return @import("anchor_paragraph_edit.zig").splice(self.allocator, &selected.tree, &selected.sites, selected.locations, source_paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes);
        return @import("plain_paragraph_edit.zig").spliceWithTabs(self.allocator, &selected.tree, &selected.sites, selected.locations, source_paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, true);
    }

    pub fn canEdit(self: *const Session, section_index: usize, paragraph: usize) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
        if (section.structure_values) |*values| {
            if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            const index = paragraph - section.first_paragraph;
            if (index >= values.paragraphs.len) return error.InvalidParagraphIndex;
            const owned = &values.paragraphs[index];
            if (owned.field_positions != null) {
                const positions = @import("fieldless_current_edit.zig").positions(self, section_index, index) catch |err| switch (err) {
                    error.UnsupportedStructuralFieldEdit, error.UnsupportedInlineControl, error.UnsupportedParagraphControl => return false,
                    else => return err,
                };
                self.allocator.free(positions);
                return true;
            }
            if (owned.joined()) |view| {
                const positions = if (owned.protected_positions != null) try @import("paragraph_protected_positions.zig").build(self.allocator, &section.tree, owned) else try @import("paragraph_joined_positions.zig").build(self.allocator, &section.tree, &view);
                defer self.allocator.free(positions);
                return true;
            }
            const locations = @import("paragraph_structure_locations.zig").build(self.allocator, &section.tree, owned) catch |err| switch (err) {
                error.MissingTextSite => return false,
                else => return err,
            };
            defer self.allocator.free(locations);
            @import("plain_paragraph_policy.zig").validateWithTabs(&section.tree, &owned.sites, locations, 1, true) catch |err| switch (err) {
                error.MissingTextSite, error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return false,
                else => return err,
            };
            return true;
        }
        @import("plain_paragraph_policy.zig").validateWithTabs(&section.tree, &section.sites, section.locations, try section.sourceParagraph(paragraph), true) catch |err| switch (err) {
            error.MissingTextSite, error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return false,
            else => return err,
        };
        const field_positions = @import("field_source_outside_positions.zig").prepareAction(self, section_index, paragraph, 0, 0, .whole_plain) catch |err| switch (err) {
            error.ProtectedFieldRange => return false,
            else => return err,
        };
        if (field_positions) |positions| self.allocator.free(positions);
        return true;
    }

    pub fn anchorText(self: *const Session, section_index: usize, paragraph: usize) ![]u8 {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
        if (section.structure_values) |*values| {
            if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            const owned = &values.paragraphs[paragraph - section.first_paragraph];
            if (owned.field_positions) |positions| if (positions.len == 0) return @import("fieldless_current_edit.zig").text(self, section_index, paragraph - section.first_paragraph);
            if (owned.joined()) |view| {
                const positions = if (owned.protected_positions != null) try @import("paragraph_protected_positions.zig").build(self.allocator, &section.tree, owned) else try @import("paragraph_joined_positions.zig").build(self.allocator, &section.tree, &view);
                defer self.allocator.free(positions);
                var text: std.ArrayList(u8) = .empty;
                defer text.deinit(self.allocator);
                for (positions) |position| {
                    const value = @import("paragraph_text_positions.zig").segmentText(&view.sites, position);
                    if (value.len > self.options.max_text_bytes -| text.items.len) return error.LimitExceeded;
                    try text.appendSlice(self.allocator, value);
                }
                return text.toOwnedSlice(self.allocator);
            }
            if (owned.protected_positions != null) return @import("paragraph_protected_positions.zig").text(self.allocator, &section.tree, owned, self.options.max_text_bytes);
            const locations = try @import("paragraph_structure_locations.zig").build(self.allocator, &section.tree, owned);
            defer self.allocator.free(locations);
            return @import("current_anchor_text.zig").read(self.allocator, &section.tree, owned, locations, self.options.max_text_bytes);
        }
        const field_positions = @import("field_source_outside_positions.zig").prepareAction(self, section_index, paragraph, 0, 0, .whole_anchored) catch |err| switch (err) {
            error.ProtectedFieldRange => return error.UnsupportedStructuralFieldEdit,
            else => return err,
        };
        if (field_positions) |positions| self.allocator.free(positions);
        return @import("anchor_paragraph_edit.zig").text(self.allocator, &section.tree, &section.sites, section.locations, try section.sourceParagraph(paragraph), self.options.max_text_bytes);
    }

    pub fn spliceFieldLabel(self: *Session, section_index: usize, paragraph: usize, begin_element: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        try self.requireMutableHostPositions();
        return @import("field_label_session.zig").splice(self, section_index, paragraph, begin_element, start, deleted, inserted);
    }
    pub fn fieldLabels(self: *const Session, section_index: usize, paragraph: usize) ![]@import("field_label_targets.zig").Target {
        return @import("field_label_targets.zig").list(self, section_index, paragraph, 4096);
    }
    pub fn setCellSize(self: *Session, section_index: usize, cell_node: usize, size: @import("table_cell_size_write.zig").Size) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        return @import("table_cell_size_values.zig").set(self.allocator, &section.tree, &section.cell_sizes, cell_node, size, self.options.max_xml_bytes);
    }
    pub fn setPictureDimensions(self: *Session, section_index: usize, picture_node: usize, update: @import("picture_dimension_write.zig").Update) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        return @import("picture_dimension_edit_values.zig").set(self.allocator, &section.tree, &section.picture_dimensions, picture_node, update, self.options.max_xml_bytes);
    }
    pub fn checkBoxState(self: *const Session, section: usize, node: usize) !@import("form_checkbox_state_session.zig").State {
        return @import("form_checkbox_state_session.zig").read(self, section, node);
    }
    pub fn setCheckBoxState(self: *Session, section: usize, node: usize, state: @import("form_checkbox_state_session.zig").State) !bool {
        return @import("form_checkbox_state_session.zig").set(self, section, node, state);
    }
    pub fn setFormulaDefinition(self: *Session, section_index: usize, begin: usize, formula: []const u8) !bool {
        try self.requireMutableHostPositions();
        return @import("formula_definition_edit.zig").set(self, section_index, begin, formula);
    }
    pub fn setPictureMatrix(self: *Session, section_index: usize, matrix_node: usize, values: [6]f64) !bool {
        return @import("picture_matrix_session.zig").set(self, section_index, matrix_node, values);
    }
    pub fn resizePicture(self: *Session, section_index: usize, picture_node: usize, size: [2]u32) !bool {
        const plan = try @import("picture_resize_plan.zig").build(self, section_index, picture_node, size);
        return @import("picture_geometry_transaction.zig").apply(self, section_index, picture_node, plan.dimensions, &plan.matrices, self.options.max_output_bytes);
    }
    pub fn setCellSizeForList(self: *Session, section_index: usize, list_node: usize, size: @import("table_cell_size_write.zig").Size) !bool {
        const bindings = try @import("table_display_bindings.zig").read(self.allocator, self, section_index);
        defer self.allocator.free(bindings);
        for (bindings) |binding| if (binding.owner.list_node == list_node) {
            return self.setCellSize(section_index, binding.owner.cell_node, size);
        };
        return error.InvalidCellDisplayOwner;
    }

    /// Caller owns the result with Session.allocator. Save is side-effect free.
    pub fn save(self: *const Session) ![]u8 {
        const a = self.allocator;
        const trees = try a.alloc(tree_module.Tree, self.sections.len);
        defer a.free(trees);
        for (self.sections, trees) |section, *tree| tree.* = section.tree;
        var replacements: std.ArrayList(zip_writer.Replacement) = .empty;
        defer {
            for (replacements.items) |replacement| a.free(replacement.bytes);
            replacements.deinit(a);
        }
        var xml_bytes: usize = 0;
        if (self.paragraph_resources.entries.items.len != 0 or self.character_resources.entries.items.len != 0 or self.font_resources.entries.items.len != 0) {
            const header = try @import("header_resource_save.zig").replacementWithFonts(a, self.source, &self.paragraph_resources, &self.character_resources, &self.font_resources, self.options.max_xml_bytes);
            errdefer a.free(header.bytes);
            try replacements.append(a, header);
            xml_bytes += header.bytes.len;
        }
        for (self.sections, 0..) |*section, index| {
            const base = if (section.structure_values) |*values| block: {
                if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
                break :block try @import("paragraph_structure_save.zig").writeWithDefinitions(a, trees, index, values, siteOptions(self.options), section.field_dirty.items, &section.formula_definitions, self.options.max_xml_bytes -| xml_bytes);
            } else try @import("formula_section_save.zig").writeWithDefinitions(a, trees, index, &section.sites, siteOptions(self.options), section.field_dirty.items, &section.formula_definitions, self.options.max_xml_bytes -| xml_bytes);
            const sized = if (section.cell_sizes.items.len == 0) base else block: {
                defer a.free(base);
                break :block try @import("table_cell_size_save.zig").write(a, &section.tree, base, section.cell_sizes.items, self.options.max_xml_bytes -| xml_bytes);
            };
            const dimensions = if (section.picture_dimensions.items.len == 0) sized else block: {
                defer a.free(sized);
                break :block try @import("picture_dimension_save.zig").write(a, &section.tree, sized, section.picture_dimensions.items, self.options.max_xml_bytes -| xml_bytes);
            };
            const matrices = if (section.picture_matrices.items.len == 0) dimensions else block: {
                defer a.free(dimensions);
                break :block try @import("picture_matrix_save.zig").write(a, &section.tree, dimensions, section.picture_matrices.items, self.options.max_xml_bytes -| xml_bytes);
            };
            const checked = if (section.checkbox_states.items.len == 0) matrices else block: {
                defer a.free(matrices);
                break :block try @import("form_checkbox_state_save.zig").write(a, &section.tree, matrices, section.checkbox_states.items, self.options.max_xml_bytes -| xml_bytes);
            };
            const bytes = if (section.created_tables.entries.items.len == 0) checked else block: {
                defer a.free(checked);
                break :block try @import("created_table_section_save.zig").write(self, index, checked, self.options.max_xml_bytes -| xml_bytes);
            };
            errdefer a.free(bytes);
            try replacements.append(a, .{ .entry_index = section.entry_index, .bytes = bytes });
            xml_bytes += bytes.len;
        }
        return zip_writer.write(a, self.source, replacements.items, .{ .max_output_bytes = self.options.max_output_bytes });
    }
    // Temporary staging gate, removed only when host edits rebase table points.
    fn requireMutableHostPositions(self: *const Session) !void {
        for (self.sections) |section| if (section.created_tables.entries.items.len != 0) return error.UnsupportedCreatedTableHostEdit;
    }
};

pub fn open(a: std.mem.Allocator, input: []const u8, options: Options) !Session {
    if (input.len > options.max_input_bytes) return error.LimitExceeded;
    const source = try a.dupe(u8, input);
    errdefer a.free(source);
    var document = try package.inspectDocument(a, source, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{ .max_sections = options.max_sections });
    defer structure.deinit(a);
    var sections: std.ArrayList(Section) = .empty;
    defer {
        for (sections.items) |*section| section.deinit(a);
        sections.deinit(a);
    }
    var counters: scanner.Report = .{};
    var xml_bytes: usize = 0;
    var text_bytes: usize = 0;
    var site_count: usize = 0;
    for (structure.sections, 0..) |section, ordinal| {
        const entry_index = document.manifest.items[section.item_index].entry_index orelse return error.ExternalSpineXml;
        const xml = try document.archive.decode(document.archive.entries[entry_index], options.max_xml_bytes -| xml_bytes);
        defer a.free(xml);
        var tree = try tree_module.parse(a, xml, .section, ordinal, section.item_index, .{ .max_xml_bytes = options.max_xml_bytes -| xml_bytes });
        errdefer tree.deinit(a);
        var sites = try sites_module.collect(a, &tree, siteOptions(options));
        errdefer sites.deinit(a);
        if (sites.items.len > options.max_sites -| site_count) return error.LimitExceeded;
        site_count += sites.items.len;
        for (sites.items) |site| {
            if (site.text.len > options.max_text_bytes -| text_bytes) return error.LimitExceeded;
            text_bytes += site.text.len;
        }
        const first = counters.paragraphs + 1;
        const locations = try locations_module.buildWithCounters(a, &tree, &sites, siteOptions(options), &counters);
        errdefer a.free(locations);
        try sections.append(a, .{ .tree = tree, .sites = sites, .locations = locations, .entry_index = entry_index, .first_paragraph = first, .source_first_paragraph = first, .last_paragraph = counters.paragraphs });
        xml_bytes += xml.len;
    }
    // Malformed field semantics remain query errors, not a new open failure.
    // Allocation failure must still propagate without retaining partial state.
    var source_fields = @import("source_field_analysis.zig").build(a, sections.items) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => null,
    };
    errdefer if (source_fields) |*fields| fields.deinit(a);
    return .{ .allocator = a, .source = source, .sections = try sections.toOwnedSlice(a), .options = options, .source_fields = source_fields };
}

/// Shared collection/serialization policy for session-bound site provenance.
pub fn siteOptions(options: Options) sites_module.Options {
    return .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true, .branch_policy = .{ .mode = .selected }, .max_text_bytes = options.max_text_bytes, .max_sites = options.max_sites };
}
