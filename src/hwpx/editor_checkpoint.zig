//! Owned editable values only. Immutable XML/ZIP remain owned by the session.
const std = @import("std");
const editor = @import("editor_session.zig");
const sites_mod = @import("text_sites.zig");
const Dirty = @import("text_sites_save.zig").FieldDirty;
const Values = @import("paragraph_structure_values.zig").Values;
const Resources = @import("paragraph_resource_values.zig");
const Characters = @import("character_resource_values.zig");

test "HWPX checkpoint owns picture dimensions and restores actual ZIP save state" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var picture: ?usize = null;
    for (section.tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
            picture = node;
            break;
        }
    }
    const node = picture orelse return error.MissingPictureImage;
    const initial_size = try size(&session, std.math.maxInt(usize));
    var before = try capture(&session, 4_000_000);
    defer before.deinit();
    try std.testing.expect(try session.setPictureDimensions(0, node, .{ .display = .{ 30000, 18000 }, .current = .{ 30000, 18000 } }));
    try std.testing.expect((try size(&session, std.math.maxInt(usize))) > initial_size);
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    const dimensions = try @import("picture_dimension_values.zig").read(a, &reopened.sections[0].tree, node);
    try std.testing.expectEqualDeep([2]?u32{ 30000, 18000 }, dimensions.display);
    try std.testing.expectEqualDeep(dimensions.display, dimensions.current);
    try std.testing.expectError(error.InvalidSectionIndex, session.setPictureDimensions(session.sections.len, node, .{}));
    try std.testing.expectError(error.LimitExceeded, capture(&session, initial_size));
    try std.testing.expectEqualDeep(@as(?[2]u32, .{ 30000, 18000 }), section.picture_dimensions.items[0].update.display);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var snapshot = try capture(&proxy, 4_000_000);
            defer snapshot.deinit();
            try std.testing.expectEqualDeep(source.sections[0].picture_dimensions.items, snapshot.states[0].picture_dimensions.items);
        }
    }.run, .{&session});
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), section.picture_dimensions.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try before.exchange(&session);
    try std.testing.expectEqualDeep(@as(?[2]u32, .{ 30000, 18000 }), section.picture_dimensions.items[0].update.display);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "HWPX checkpoint owns current field positions and rejects stale coordinates" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    var transferred = false;
    defer if (!transferred) values.deinit(a);
    values.paragraphs[0].field_positions = try @import("field_source_positions.zig").build(a, &trees, 0, &values.paragraphs[0], &report, 100);
    const empty = try a.alloc(sites_mod.Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = values;
    transferred = true;
    const original = section.structure_values.?.paragraphs[0].field_positions.?[0].unit;
    var snapshot = try capture(&session, 4_000_000);
    defer snapshot.deinit();
    section.structure_values.?.paragraphs[0].field_positions.?[0].unit = original + 3;
    try snapshot.exchange(&session);
    try std.testing.expectEqual(original, section.structure_values.?.paragraphs[0].field_positions.?[0].unit);
    try snapshot.exchange(&session);
    try std.testing.expectEqual(original + 3, section.structure_values.?.paragraphs[0].field_positions.?[0].unit);
    try std.testing.expectError(error.InvalidFieldPositions, session.save());
    try std.testing.expectError(error.InvalidFieldPositions, session.fieldLabels(0, section.first_paragraph));
    try std.testing.expectEqualSlices(u8, input, session.source);
}

fn formulaCheckpointCase(a: std.mem.Allocator) !void {
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var begin: ?usize = null;
    for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = index;
    }
    const node = begin orelse return error.MissingFormulaFieldNode;
    const before = try size(&session, std.math.maxInt(usize));
    try std.testing.expect(try section.formula_definitions.set(a, &section.tree, node, "=AVG(A1:A1)"));
    try std.testing.expect((try size(&session, std.math.maxInt(usize))) > before);
    var checkpoint = try capture(&session, std.math.maxInt(usize));
    defer checkpoint.deinit();
    try std.testing.expect(try section.formula_definitions.set(a, &section.tree, node, "=SUM(A1:A1)"));
    try checkpoint.exchange(&session);
    try std.testing.expectEqualStrings("=AVG(A1:A1)", section.formula_definitions.get(node).?);
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    var query = try @import("formula_source_query.zig").read(a, &reopened.sections[0].tree, node);
    defer query.deinit();
    try std.testing.expectEqualStrings("=AVG(A1:A1)", query.values.formula.?);
    try std.testing.expectEqualStrings("=AVG(A1:A1)??%g,;;2", query.values.command.?);
    try checkpoint.exchange(&session);
    try std.testing.expect(section.formula_definitions.get(node) == null);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "HWPX checkpoint owns formula definitions and prevents unsaved state loss" {
    try formulaCheckpointCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(formulaCheckpointCase, .{});
}

test "HWPX checkpoint exchanges owned protected positions without modifying source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.first_paragraph - 1 };
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    var transferred = false;
    defer if (!transferred) values.deinit(a);
    values.paragraphs[0].protected_positions = try a.dupe(@import("paragraph_structure_values.zig").ProtectedPosition, &.{.{ .element_index = 7, .unit = 3, .kind = .anchor }});
    const empty = try a.alloc(sites_mod.Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = values;
    transferred = true;
    var snapshot = try capture(&session, 4_000_000);
    defer snapshot.deinit();
    section.structure_values.?.paragraphs[0].protected_positions.?[0].unit = 8;
    try snapshot.exchange(&session);
    try std.testing.expectEqual(@as(usize, 3), section.structure_values.?.paragraphs[0].protected_positions.?[0].unit);
    try snapshot.exchange(&session);
    try std.testing.expectEqual(@as(usize, 8), section.structure_values.?.paragraphs[0].protected_positions.?[0].unit);
    try std.testing.expectError(error.SourceBindingMismatch, session.save());
    try std.testing.expectEqualSlices(u8, input, session.source);
}
const State = struct {
    sites: sites_mod.Sites,
    structure_values: ?Values,
    first_paragraph: usize,
    last_paragraph: usize,
    dirty: std.ArrayList(Dirty),
    cell_sizes: @import("table_cell_size_values.zig").Values,
    picture_dimensions: @import("picture_dimension_edit_values.zig").Values,
    picture_matrices: @import("picture_matrix_edit_values.zig").Values,
    picture_frames: @import("picture_frame_values.zig").Values = .empty,
    checkbox_states: @import("form_checkbox_state_values.zig").Values,
    dutmal_texts: @import("dutmal_text_values.zig").Values,
    equation_scripts: @import("equation_script_values.zig").Values = .{},
    formula_definitions: @import("formula_definition_values.zig").Values,
    formula_result_overrides: @import("formula_result_override_values.zig").Values,
    created_tables: @import("created_table_values.zig").Values,
    fn deinit(self: *State, a: std.mem.Allocator) void {
        self.sites.deinit(a);
        if (self.structure_values) |*values| values.deinit(a);
        self.dirty.deinit(a);
        self.cell_sizes.deinit(a);
        self.picture_dimensions.deinit(a);
        self.picture_matrices.deinit(a);
        self.picture_frames.deinit(a);
        self.checkbox_states.deinit(a);
        self.dutmal_texts.deinit(a);
        self.equation_scripts.deinit(a);
        self.formula_definitions.deinit(a);
        self.formula_result_overrides.deinit(a);
        self.created_tables.deinit(a);
    }
};

pub const Checkpoint = struct {
    allocator: std.mem.Allocator,
    source_pointer: [*]const u8,
    source_len: usize,
    states: []State,
    max_bytes: usize,
    paragraph_resources: Resources.Values,
    character_resources: Characters.Values,
    chart_resources: @import("chart_resource_values.zig").Values = .{},
    font_resources: @import("../model/font_resource_values.zig").Values,

    pub fn deinit(self: *Checkpoint) void {
        self.paragraph_resources.deinit(self.allocator);
        self.character_resources.deinit(self.allocator);
        self.chart_resources.deinit(self.allocator);
        self.font_resources.deinit(self.allocator);
        for (self.states) |*state| state.deinit(self.allocator);
        self.allocator.free(self.states);
        self.* = undefined;
    }

    /// Swap is allocation-free and also retains the replaced state for redo.
    /// The originating session must remain alive; a reopened session differs.
    pub fn exchange(self: *Checkpoint, session: *editor.Session) !void {
        try self.bind(session);
        _ = try size(session, self.max_bytes);
        self.swap(session);
    }

    /// Restore a captured state even when the failed edit exceeded its budget.
    /// The caller must discard this checkpoint after rollback, not enqueue redo.
    pub fn rollback(self: *Checkpoint, session: *editor.Session) !void {
        try self.bind(session);
        self.swap(session);
    }

    fn bind(self: *const Checkpoint, session: *const editor.Session) !void {
        if (self.source_pointer != session.source.ptr or self.source_len != session.source.len or self.states.len != session.sections.len or self.allocator.ptr != session.allocator.ptr or self.allocator.vtable != session.allocator.vtable) return error.SourceBindingMismatch;
    }

    fn swap(self: *Checkpoint, session: *editor.Session) void {
        std.mem.swap(Resources.Values, &self.paragraph_resources, &session.paragraph_resources);
        std.mem.swap(Characters.Values, &self.character_resources, &session.character_resources);
        std.mem.swap(@import("chart_resource_values.zig").Values, &self.chart_resources, &session.chart_resources);
        std.mem.swap(@import("../model/font_resource_values.zig").Values, &self.font_resources, &session.font_resources);
        for (self.states, session.sections) |*state, *section| {
            std.mem.swap(sites_mod.Sites, &state.sites, &section.sites);
            std.mem.swap(@import("form_checkbox_state_values.zig").Values, &state.checkbox_states, &section.checkbox_states);
            std.mem.swap(@import("dutmal_text_values.zig").Values, &state.dutmal_texts, &section.dutmal_texts);
            std.mem.swap(@import("equation_script_values.zig").Values, &state.equation_scripts, &section.equation_scripts);
            std.mem.swap(?Values, &state.structure_values, &section.structure_values);
            std.mem.swap(usize, &state.first_paragraph, &section.first_paragraph);
            std.mem.swap(usize, &state.last_paragraph, &section.last_paragraph);
            std.mem.swap(std.ArrayList(Dirty), &state.dirty, &section.field_dirty);
            std.mem.swap(@import("table_cell_size_values.zig").Values, &state.cell_sizes, &section.cell_sizes);
            std.mem.swap(@import("picture_dimension_edit_values.zig").Values, &state.picture_dimensions, &section.picture_dimensions);
            std.mem.swap(@import("picture_matrix_edit_values.zig").Values, &state.picture_matrices, &section.picture_matrices);
            std.mem.swap(@import("picture_frame_values.zig").Values, &state.picture_frames, &section.picture_frames);
            std.mem.swap(@import("formula_definition_values.zig").Values, &state.formula_definitions, &section.formula_definitions);
            std.mem.swap(@import("formula_result_override_values.zig").Values, &state.formula_result_overrides, &section.formula_result_overrides);
            std.mem.swap(@import("created_table_values.zig").Values, &state.created_tables, &section.created_tables);
        }
    }
};

test "HWPX checkpoint font intents own names include budget and exchange allocation free" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var session: editor.Session = .{ .allocator = a, .source = try a.alloc(u8, 0), .sections = try a.alloc(editor.Section, 0), .options = .{} };
            defer session.deinit();
            const baseline = try size(&session, 4096);
            _ = try session.font_resources.add(a, .latin, 9, "Font", 4);
            const required = try size(&session, 4096);
            try std.testing.expectEqual(session.font_resources.entries.capacity * @sizeOf(@import("../model/font_face_value.zig").Value) + 4, required - baseline);
            try std.testing.expectError(error.LimitExceeded, capture(&session, required - 1));
            var checkpoint = try capture(&session, 4096);
            defer checkpoint.deinit();
            session.font_resources.entries.items[0].name.?[0] = 'X';
            try checkpoint.exchange(&session);
            try std.testing.expectEqualStrings("Font", session.font_resources.entries.items[0].name.?);
            try checkpoint.exchange(&session);
            try std.testing.expectEqualStrings("Xont", session.font_resources.entries.items[0].name.?);
        }
    }.run, .{});
}

pub fn capture(session: *const editor.Session, max_bytes: usize) !Checkpoint {
    _ = try size(session, max_bytes);
    const a = session.allocator;
    var paragraph_resources = try session.paragraph_resources.clone(a);
    errdefer paragraph_resources.deinit(a);
    var character_resources = try session.character_resources.clone(a);
    errdefer character_resources.deinit(a);
    var font_resources = try session.font_resources.clone(a);
    errdefer font_resources.deinit(a);
    var chart_resources = try session.chart_resources.clone(a);
    errdefer chart_resources.deinit(a);
    const states = try a.alloc(State, session.sections.len);
    var initialized: usize = 0;
    errdefer {
        for (states[0..initialized]) |*state| state.deinit(a);
        a.free(states);
    }
    for (session.sections, states) |section, *state| {
        var sites = try section.sites.clone(a);
        errdefer sites.deinit(a);
        var structure_values = if (section.structure_values) |*values| try values.clone(a) else null;
        errdefer if (structure_values) |*values| values.deinit(a);
        const dirty = try a.dupe(Dirty, section.field_dirty.items);
        errdefer a.free(dirty);
        const cell_sizes = try a.dupe(@import("table_cell_size_values.zig").Entry, section.cell_sizes.items);
        errdefer a.free(cell_sizes);
        const picture_dimensions = try a.dupe(@import("picture_dimension_edit_values.zig").Entry, section.picture_dimensions.items);
        errdefer a.free(picture_dimensions);
        const picture_matrices = try a.dupe(@import("picture_matrix_edit_values.zig").Entry, section.picture_matrices.items);
        errdefer a.free(picture_matrices);
        const picture_frames = try a.dupe(@import("picture_frame_values.zig").Entry, section.picture_frames.items);
        errdefer a.free(picture_frames);
        const checkbox_states = try a.dupe(@import("form_checkbox_state_values.zig").Entry, section.checkbox_states.items);
        errdefer a.free(checkbox_states);
        var dutmal_texts = try section.dutmal_texts.clone(a);
        errdefer dutmal_texts.deinit(a);
        var equation_scripts = try section.equation_scripts.clone(a);
        errdefer equation_scripts.deinit(a);
        const formula_definitions = try section.formula_definitions.clone(a);
        errdefer {
            var definitions = formula_definitions;
            definitions.deinit(a);
        }
        const formula_result_overrides = try section.formula_result_overrides.clone(a);
        errdefer {
            var overrides = formula_result_overrides;
            overrides.deinit(a);
        }
        const created_tables = try section.created_tables.clone(a);
        state.* = .{ .sites = sites, .structure_values = structure_values, .first_paragraph = section.first_paragraph, .last_paragraph = section.last_paragraph, .dirty = .{ .items = dirty, .capacity = dirty.len, .pointer_stability = .{} }, .cell_sizes = .{ .items = cell_sizes, .capacity = cell_sizes.len, .pointer_stability = .{} }, .picture_dimensions = .{ .items = picture_dimensions, .capacity = picture_dimensions.len, .pointer_stability = .{} }, .picture_matrices = .{ .items = picture_matrices, .capacity = picture_matrices.len, .pointer_stability = .{} }, .checkbox_states = .{ .items = checkbox_states, .capacity = checkbox_states.len, .pointer_stability = .{} }, .dutmal_texts = dutmal_texts, .formula_definitions = formula_definitions, .formula_result_overrides = formula_result_overrides, .created_tables = created_tables };
        state.equation_scripts = equation_scripts;
        state.picture_frames = .{ .items = picture_frames, .capacity = picture_frames.len, .pointer_stability = .{} };
        initialized += 1;
    }
    return .{ .allocator = a, .source_pointer = session.source.ptr, .source_len = session.source.len, .states = states, .max_bytes = max_bytes, .paragraph_resources = paragraph_resources, .character_resources = character_resources, .font_resources = font_resources, .chart_resources = chart_resources };
}

pub fn size(session: *const editor.Session, limit: usize) !usize {
    var total: usize = 0;
    try add(&total, try session.chart_resources.byteSize(limit), limit);
    try add(&total, try multiply(session.paragraph_resources.entries.capacity, @sizeOf(Resources.Entry)), limit);
    try add(&total, try multiply(session.character_resources.entries.capacity, @sizeOf(Characters.Entry)), limit);
    try add(&total, try multiply(session.font_resources.entries.capacity, @sizeOf(@import("../model/font_face_value.zig").Value)), limit);
    for (session.font_resources.entries.items) |font| if (font.name) |name| try add(&total, name.len, limit);
    try add(&total, try multiply(session.sections.len, @sizeOf(State)), limit);
    for (session.sections) |section| {
        try add(&total, try section.created_tables.byteSize(limit -| total), limit);
        if (section.structure_values) |*values| {
            if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
            try add(&total, try values.byteSize(limit -| total), limit);
        }
        try add(&total, try multiply(section.sites.items.len, @sizeOf(sites_mod.Site)), limit);
        // Capacity accounts for buffers transferred into the checkpoint.
        try add(&total, try multiply(section.field_dirty.capacity, @sizeOf(Dirty)), limit);
        try add(&total, try multiply(section.cell_sizes.capacity, @sizeOf(@import("table_cell_size_values.zig").Entry)), limit);
        try add(&total, try multiply(section.picture_dimensions.capacity, @sizeOf(@import("picture_dimension_edit_values.zig").Entry)), limit);
        try add(&total, try multiply(section.picture_matrices.capacity, @sizeOf(@import("picture_matrix_edit_values.zig").Entry)), limit);
        try add(&total, try multiply(section.picture_frames.capacity, @sizeOf(@import("picture_frame_values.zig").Entry)), limit);
        try add(&total, try multiply(section.checkbox_states.capacity, @sizeOf(@import("form_checkbox_state_values.zig").Entry)), limit);
        try add(&total, try section.dutmal_texts.byteSize(limit - total), limit);
        try add(&total, try section.equation_scripts.byteSize(limit - total), limit);
        try add(&total, try multiply(section.formula_definitions.entries.capacity, @sizeOf(@import("formula_definition_values.zig").Entry)), limit);
        for (section.formula_definitions.entries.items) |entry| try add(&total, entry.formula.len, limit);
        try add(&total, try multiply(section.formula_result_overrides.entries.capacity, @sizeOf(@import("formula_result_override_values.zig").Entry)), limit);
        for (section.formula_result_overrides.entries.items) |entry| try add(&total, entry.display.len, limit);
        for (section.sites.items) |site| try add(&total, site.text.len, limit);
    }
    return total;
}
fn multiply(left: usize, right: usize) !usize {
    return std.math.mul(usize, left, right) catch error.LimitExceeded;
}

test "HWPX checkpoint rollback restores an over-budget edit without weakening history limits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const budget = try size(&session, 4_000_000);
    var before = try capture(&session, budget);
    defer before.deinit();
    const ids = try @import("character_style_resources.zig").ids(&session);
    defer a.free(ids);
    _ = try session.character_resources.add(a, ids, ids[0], .{ .bold = true });
    try std.testing.expectError(error.LimitExceeded, before.exchange(&session));
    try std.testing.expectEqual(@as(usize, 1), session.character_resources.entries.items.len);
    var foreign = session;
    foreign.source = input[1..];
    try std.testing.expectError(error.SourceBindingMismatch, before.rollback(&foreign));
    try std.testing.expectEqual(@as(usize, 1), session.character_resources.entries.items.len);
    try before.rollback(&session);
    try std.testing.expectEqual(budget, before.max_bytes);
    try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}

test "HWPX checkpoint owns character intents exchanges history and covers allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const initial_size = try size(&session, 4_000_000);
    var before = try capture(&session, 4_000_000);
    defer before.deinit();
    const ids = try @import("character_style_resources.zig").ids(&session);
    defer a.free(ids);
    const id = try session.character_resources.add(a, ids, ids[0], .{ .size = 2400, .bold = false, .underline_kind = .center });
    const current_ids = try @import("character_style_resources.zig").ids(&session);
    defer a.free(current_ids);
    try std.testing.expectEqual(ids.len + 1, current_ids.len);
    try std.testing.expect(std.mem.indexOfScalar(u32, current_ids, id) != null);
    const current_shapes = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(current_shapes);
    var current_found = false;
    for (current_shapes) |shape| if (shape.id == id) {
        current_found = true;
        try std.testing.expectEqual(@as(?i32, 2400), shape.height);
        try std.testing.expect(!shape.bold);
    };
    try std.testing.expect(current_found);
    const previous = session.character_resources.entries.items[0];
    session.character_resources.entries.items[0].id = ids[0];
    try std.testing.expectError(error.DuplicateCharacterResourceId, @import("character_style_resources.zig").ids(&session));
    session.character_resources.entries.items[0] = previous;
    session.character_resources.entries.items[0].source_id = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidCharacterShapeReference, @import("character_style_resources.zig").ids(&session));
    session.character_resources.entries.items[0] = previous;
    try std.testing.expectEqual(initial_size + session.character_resources.entries.capacity * @sizeOf(Characters.Entry), try size(&session, 4_000_000));
    try std.testing.expectError(error.LimitExceeded, capture(&session, initial_size));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var snapshot = try capture(&proxy, 4_000_000);
            defer snapshot.deinit();
            try std.testing.expectEqualDeep(source.character_resources.entries.items, snapshot.character_resources.entries.items);
            snapshot.character_resources.entries.items[0].properties.size = 1200;
            snapshot.character_resources.entries.items[0].properties.underline_kind = .top;
            try std.testing.expectEqual(@import("../model/document.zig").CharacterUnderlineKind.center, source.character_resources.entries.items[0].properties.underline_kind.?);
            try std.testing.expectEqual(@as(?i32, 2400), source.character_resources.entries.items[0].properties.size);
        }
    }.run, .{&session});
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
    try before.exchange(&session);
    try std.testing.expectEqual(id, session.character_resources.entries.items[0].id);
    try std.testing.expectEqual(@as(?bool, false), session.character_resources.entries.items[0].properties.bold);
    try std.testing.expectEqual(@import("../model/document.zig").CharacterUnderlineKind.center, session.character_resources.entries.items[0].properties.underline_kind.?);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const shapes = try @import("character_style_resources.zig").displayShapes(&reopened);
    defer a.free(shapes);
    var found = false;
    for (shapes) |shape| if (shape.id == id) {
        found = true;
        try std.testing.expectEqual(@as(?i32, 2400), shape.height);
        try std.testing.expect(!shape.bold);
    };
    try std.testing.expect(found);
    try before.exchange(&session);
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try before.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX checkpoint owns paragraph resource intents and saves header edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var before = try capture(&session, 4_000_000);
    defer before.deinit();
    const initial_size = try size(&session, 4_000_000);
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    const id = try session.paragraph_resources.add(a, ids, ids[0], .RIGHT);
    const current_ids = try session.paragraphShapeIds();
    defer a.free(current_ids);
    try @import("paragraph_style_resources.zig").requireExisting(current_ids, id);
    const current_shapes = try session.paragraphShapes();
    defer @import("paragraph_display_resources.zig").deinit(a, current_shapes);
    var current_found = false;
    for (current_shapes) |shape| if (shape.id == id) {
        try std.testing.expectEqualStrings("RIGHT", shape.horizontal.?);
        current_found = true;
    };
    try std.testing.expect(current_found);
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    const new_ids = try reopened.paragraphShapeIds();
    defer a.free(new_ids);
    try @import("paragraph_style_resources.zig").requireExisting(new_ids, id);
    try std.testing.expectEqual(ids.len + 1, new_ids.len);
    const shapes = try reopened.paragraphShapes();
    defer @import("paragraph_display_resources.zig").deinit(a, shapes);
    var found = false;
    for (shapes) |shape| if (shape.id == id) {
        try std.testing.expectEqualStrings("RIGHT", shape.horizontal.?);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expectError(error.LimitExceeded, capture(&session, initial_size));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var snapshot = try capture(&proxy, 4_000_000);
            defer snapshot.deinit();
            try std.testing.expectEqualDeep(source.paragraph_resources.entries.items, snapshot.paragraph_resources.entries.items);
            snapshot.paragraph_resources.entries.items[0].alignment = .LEFT;
            try std.testing.expectEqual(Resources.Entry{ .source_id = source.paragraph_resources.entries.items[0].source_id, .id = source.paragraph_resources.entries.items[0].id, .alignment = .RIGHT }, source.paragraph_resources.entries.items[0]);
        }
    }.run, .{&session});
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
    const undone_ids = try session.paragraphShapeIds();
    defer a.free(undone_ids);
    try std.testing.expectEqualSlices(u32, ids, undone_ids);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try before.exchange(&session);
    try std.testing.expectEqual(id, session.paragraph_resources.entries.items[0].id);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
    const duplicate = session.paragraph_resources.entries.items[0];
    try session.paragraph_resources.entries.append(a, duplicate);
    try std.testing.expectError(error.DuplicateParagraphResourceId, session.save());
    session.paragraph_resources.entries.items.len -= 1;
    session.paragraph_resources.entries.items[0].source_id = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidParagraphShapeReference, session.save());
    session.paragraph_resources.entries.items[0] = duplicate;
    const original_limit = session.options.max_xml_bytes;
    session.options.max_xml_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, session.save());
    session.options.max_xml_bytes = original_limit;
    try std.testing.expectEqualSlices(u8, input, session.source);
}
fn add(total: *usize, amount: usize, limit: usize) !void {
    if (amount > limit -| total.*) return error.LimitExceeded;
    total.* += amount;
}

test "HWPX checkpoint owns cell sizes and swaps them independently of text" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var before = try capture(&session, 4_000_000);
    defer before.deinit();
    const section = &session.sections[0];
    var cell: ?usize = null;
    for (section.tree.elements, 0..) |_, index| if (@import("table_xml_fields.zig").childIs(&section.tree, index, "tc")) {
        cell = index;
        break;
    };
    try std.testing.expect(try session.setCellSize(0, cell.?, .{ .width = 1234, .height = 5678 }));
    try std.testing.expectError(error.InvalidSectionIndex, session.setCellSize(session.sections.len, cell.?, .{ .width = 1, .height = 1 }));
    const bindings = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    var observed = false;
    for (bindings) |binding| if (binding.owner.cell_node == cell.?) {
        try std.testing.expectEqual(@as(?u32, 1234), binding.owner.cell.width);
        try std.testing.expectEqual(@as(?u32, 5678), binding.owner.cell.height);
        observed = true;
    };
    try std.testing.expect(observed);
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    const cell_value = try @import("table_display_cell.zig").read(a, &reopened.sections[0].tree, cell.?);
    try std.testing.expectEqual(@as(?u32, 1234), cell_value.width);
    try std.testing.expectEqual(@as(?u32, 5678), cell_value.height);
    var edited = try capture(&session, 4_000_000);
    defer edited.deinit();
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), section.cell_sizes.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try before.exchange(&session);
    try std.testing.expectEqual(@as(u32, 1234), section.cell_sizes.items[0].size.width);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var snapshot = try capture(&proxy, 4_000_000);
            defer snapshot.deinit();
            try std.testing.expectEqualDeep(source.sections[0].cell_sizes.items, snapshot.states[0].cell_sizes.items);
        }
    }.run, .{&session});
}

test "HWPX checkpoint transfers structural topology without duplicate text ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var before = try capture(&session, 4_000_000);
    defer before.deinit();
    const section = &session.sections[0];
    const old_last = section.last_paragraph;
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.first_paragraph - 1 };
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    defer values.deinit(a);
    const id = try @import("paragraph_instance_ids.zig").next(a, &.{section.tree}, &.{}, 2_000_000);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &section.tree, &values, 1, 0, 0, id, 4_000_000);
    section.structure_values = split;
    try std.testing.expectError(error.DuplicateCurrentTextOwner, size(&session, 4_000_000));
    section.structure_values = null;
    const empty = a.alloc(sites_mod.Site, 0) catch |err| {
        split.deinit(a);
        return err;
    };
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = split;
    section.last_paragraph += 1;
    try std.testing.expect(try session.canEdit(0, section.first_paragraph + 2));
    try std.testing.expect(try session.splice(0, section.first_paragraph + 2, 0, 0, "후속편집😀<&"));
    const edited_zip = try session.save();
    defer a.free(edited_zip);
    var reopened = try editor.open(a, edited_zip, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(section.last_paragraph, reopened.sections[0].last_paragraph);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const editor.Session) !void {
            var proxy = borrowed.*;
            proxy.allocator = allocator;
            var checkpoint = try capture(&proxy, 4_000_000);
            defer checkpoint.deinit();
        }
    }.run, .{&session});
    var after = try capture(&session, 4_000_000);
    defer after.deinit();
    try before.exchange(&session);
    try std.testing.expect(section.structure_values == null);
    try std.testing.expect(section.sites.items.len > 0);
    try std.testing.expectEqual(old_last, section.last_paragraph);
    const restored_zip = try session.save();
    defer a.free(restored_zip);
    try std.testing.expectEqualSlices(u8, input, restored_zip);
    try before.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), section.sites.items.len);
    try std.testing.expectEqual(values.paragraphs.len + 1, section.structure_values.?.paragraphs.len);
    try std.testing.expectEqual(old_last + 1, section.last_paragraph);
    const redone_zip = try session.save();
    defer a.free(redone_zip);
    try std.testing.expectEqualSlices(u8, edited_zip, redone_zip);
    try after.exchange(&session);
    try std.testing.expectEqual(@as(?u32, id), section.structure_values.?.paragraphs[2].generated_id);
}
