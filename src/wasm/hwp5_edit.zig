//! Optional experimental editing ABI. One native session per WASM instance.
const std = @import("std");
const a = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const Session = edit.Session;
const History = @import("../hwp5/edit/editor_history.zig").History;
var active: ?*Session = null;
var history: ?History = null;
var output: ?[]u8 = null;
var reflow: bool = false;
var normalization: ?@import("../cfb/observed_repairs.zig").Deviations = null;
var available_section_copy: ?@import("../hwp5/edit/available_section_copy.zig").Report = null;

fn fail(err: anyerror) u32 {
    _ = errors.fail(err);
    return 0;
}
fn session() !*Session {
    return active orelse error.EditorNotOpen;
}
export fn hwp5_edit_validate_text_source_policy(section_index: u32) u32 {
    const s = session() catch |err| return fail(err);
    s.validateTextSourcePolicy(section_index) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_text_source_protection(section_index: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    var snapshot = s.textSourceProtection(a, section_index) catch |err| return fail(err);
    defer snapshot.deinit(a);
    output = std.json.Stringify.valueAlloc(a, snapshot, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
    reflow = false;
}
export fn hwp5_edit_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwp5_edit_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwp5_edit_reflow() u32 {
    return @intFromBool(reflow);
}
export fn hwp5_edit_close() void {
    hwp5_edit_output_free();
    if (history) |*value| value.deinit();
    history = null;
    if (active) |s| s.close();
    active = null;
    normalization = null;
    available_section_copy = null;
}
export fn hwp5_edit_open_available_section_copy(ptr: [*]const u8, size: usize) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = @import("../hwp5/edit/available_section_copy.zig").open(a, ptr[0..size]) catch |err| return fail(err);
    // Commit only after the entire candidate session has opened successfully.
    hwp5_edit_close();
    active = next.session;
    available_section_copy = next.report;
    return 1;
}
export fn hwp5_edit_available_section_copy_info() u32 {
    hwp5_edit_output_free();
    _ = session() catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, available_section_copy, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_open_normalized(ptr: [*]const u8, size: usize) u32 {
    return openNormalizedMode(ptr, size, false);
}
export fn hwp5_edit_open_observed_docinfo(ptr: [*]const u8, size: usize, normalize_cfb: u32) u32 {
    if (normalize_cfb > 1) return fail(error.InvalidNormalizationOption);
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    if (normalize_cfb == 1) {
        const next = @import("../hwp5/edit/normalized_open.zig").openRetainingObservedDocInfo(a, ptr[0..size]) catch |err| return fail(err);
        hwp5_edit_close();
        active = next.session;
        normalization = next.deviations;
    } else {
        const next = Session.openRetainingObservedDocInfo(a, ptr[0..size]) catch |err| return fail(err);
        hwp5_edit_close();
        active = next;
    }
    return 1;
}
export fn hwp5_edit_observed_docinfo_diagnostics() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, s.observedDocInfoDiagnostics(), .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_open_normalized_distribution(ptr: [*]const u8, size: usize) u32 {
    return openNormalizedMode(ptr, size, true);
}
fn openNormalizedMode(ptr: [*]const u8, size: usize, distribution: bool) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const normalized = @import("../hwp5/edit/normalized_open.zig");
    const next = (if (distribution) normalized.openDistribution(a, ptr[0..size]) else normalized.open(a, ptr[0..size])) catch |err| return fail(err);
    hwp5_edit_close();
    active = next.session;
    normalization = next.deviations;
    return 1;
}
export fn hwp5_edit_normalization_info() u32 {
    hwp5_edit_output_free();
    _ = session() catch |err| return fail(err);
    // Legacy metadata must never mislabel this baseline as the original input.
    if (available_section_copy != null) return fail(error.AvailableSectionCopyBaseline);
    output = std.json.Stringify.valueAlloc(a, normalization, .{ .emit_nonportable_numbers_as_strings = true }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_open(ptr: [*]const u8, size: usize) u32 {
    return openMode(ptr, size, false);
}
export fn hwp5_edit_open_distribution(ptr: [*]const u8, size: usize) u32 {
    return openMode(ptr, size, true);
}
fn openMode(ptr: [*]const u8, size: usize, distribution: bool) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = (if (distribution) Session.openDistribution(a, ptr[0..size]) else Session.open(a, ptr[0..size])) catch |err| return fail(err);
    hwp5_edit_close();
    active = next;
    return 1;
}
export fn hwp5_edit_history_enable(entries: u32, checkpoint_bytes: u32) u32 {
    const s = session() catch |err| return fail(err);
    if (history != null) return fail(error.HistoryAlreadyEnabled);
    if (@as(u64, entries) * checkpoint_bytes > 128 * 1024 * 1024) return fail(error.LimitExceeded);
    history = History.init(a, s, entries, checkpoint_bytes) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_history_revision() u32 {
    if (history) |*value| return value.stack.revision;
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
export fn hwp5_edit_history_revision_count() u32 {
    if (history) |*value| return @intCast(value.stack.revisionCount());
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
export fn hwp5_edit_history_revision_at(index: u32) u32 {
    if (history) |*value| return value.stack.revisionAt(index) orelse {
        _ = fail(error.InvalidHistoryRevisionIndex);
        return std.math.maxInt(u32);
    };
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
fn travel(redo: bool) u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return 2;
    };
    const value = if (history) |*h| h else {
        _ = fail(error.HistoryNotEnabled);
        return 2;
    };
    const changed = (if (redo) value.redo(s) else value.undo(s)) catch |err| {
        _ = fail(err);
        return 2;
    };
    return @intFromBool(changed);
}
export fn hwp5_edit_undo() u32 {
    return travel(false);
}
export fn hwp5_edit_redo() u32 {
    return travel(true);
}
fn apply(command: edit.Command) !void {
    const s = try session();
    if (history) |*value| {
        _ = try value.apply(s, command);
    } else try s.apply(command);
}
export fn hwp5_edit_set_formula_definition(section: u32, source_node: u32, ptr: [*]const u8, size: usize) u32 {
    hwp5_edit_output_free();
    if (size > @import("../hwp5/edit/formula_definition_command.zig").max_expression_bytes) return fail(error.LimitExceeded);
    apply(.{ .set_formula_definition = .{ .section = section, .source_node = source_node, .formula = ptr[0..size] } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_formula_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.formulaSources(a, section) catch |err| return fail(err);
    defer @import("../hwp5/edit/formula_snapshot.zig").deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_field_spans(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.fieldSpans(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_field_topology(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    var report = s.fieldTopology(a, section) catch |err| return fail(err);
    defer report.deinit(a);
    output = std.json.Stringify.valueAlloc(a, report, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_section_count() u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.sectionCount());
}
export fn hwp5_edit_paragraph_count(section: u32) u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.paragraphCount(section) catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    });
}
export fn hwp5_edit_char_shape_count() u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.characterShapeCount());
}
export fn hwp5_edit_para_shape_count() u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return @intCast(s.paragraphShapeCount());
}
export fn hwp5_edit_para_shape_id(section: u32, paragraph: u32) u32 {
    const s = session() catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
    return s.paragraphShapeId(section, paragraph) catch |err| {
        _ = fail(err);
        return std.math.maxInt(u32);
    };
}
export fn hwp5_edit_set_paragraph_format(section: u32, paragraph: u32, id: u32) u32 {
    apply(.{ .set_paragraph_format = .{ .section = section, .paragraph = paragraph, .para_shape_id = id } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_paragraph_alignment(section: u32, paragraph: u32, alignment: u32) u32 {
    apply(.{ .set_paragraph_alignment = .{ .section = section, .paragraph = paragraph, .alignment = alignment } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_paragraph_margins(section: u32, paragraph: u32, mask: u32, left: i32, right: i32, indent: i32, before: i32, after: i32) u32 {
    if (mask & ~@as(u32, 31) != 0) return fail(error.InvalidParagraphMargins);
    apply(.{ .set_paragraph_margins = .{ .section = section, .paragraph = paragraph, .margins = .{
        .left = if (mask & 1 != 0) left else null,
        .right = if (mask & 2 != 0) right else null,
        .indent = if (mask & 4 != 0) indent else null,
        .before = if (mask & 8 != 0) before else null,
        .after = if (mask & 16 != 0) after else null,
    } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_paragraph_spacing(section: u32, paragraph: u32, kind: u32, value: i32) u32 {
    apply(.{ .set_paragraph_spacing = .{ .section = section, .paragraph = paragraph, .spacing = .{ .kind = kind, .value = value } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_copy_text(section: u32, paragraph: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    output = s.copyText(a, section, paragraph) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_paragraph_shapes() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.paragraphShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    output = @import("paragraph_shapes_wire.zig").encode(a, shapes) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_shapes() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    output = @import("character_shapes_wire.zig").encode(a, shapes) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_font_metrics() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    output = @import("../hwp5/edit/character_font_metrics.zig").encode(a, shapes) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_text_colors() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_color_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .color = if (shape.text_color_raw <= 0xffffff) @import("../model/rgb_color.zig").hwp5(shape.text_color_raw) else null };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_shades() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const snapshot = @import("../model/character_shade_snapshot.zig");
    const rows = a.alloc(snapshot.Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id, @import("../model/shade_color.zig").hwp5(shape.shade_color_raw));
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_effects() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const snapshot = @import("../model/character_effect_snapshot.zig");
    const rows = a.alloc(snapshot.Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id, shape.effects);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_outlines() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_outline_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .state = switch (shape.outline_kind_raw) {
        0 => .none,
        1 => .solid,
        7 => .unknown,
        else => .other,
    }, .rawKind = shape.outline_kind_raw };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_font_references() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = struct { id: u32, fontIds: ?@import("../model/character_fonts.zig").Values };
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| {
        var ids: @import("../model/character_fonts.zig").Values = @splat(null);
        for (shape.font_ids, 0..) |id, language| ids[language] = id;
        row.* = .{ .id = shape.id, .fontIds = ids };
    }
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_font_faces() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.fontFaces(a) catch |err| return fail(err);
    defer @import("../model/font_face_value.zig").deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_font_face_metadata() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.fontFaceMetadata(a) catch |err| return fail(err);
    defer {
        for (rows) |*row| row.deinit(a);
        a.free(rows);
    }
    output = std.json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .fonts = rows }, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_strike_styles() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_strike_snapshot.zig").StyleRow;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .raw_style = shape.strike_style_raw, .raw_color = shape.strike_color_raw };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_strikes() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_strike_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .enabled = switch (shape.strike_kind_raw) {
        0 => false,
        1 => true,
        else => null,
    } };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_underlines() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_underline_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .kind = switch (shape.underline_kind_raw) {
        0 => .none,
        1 => .bottom,
        3 => .top,
        2 => null,
    } };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_underline_styles() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const shapes = s.characterShapes(a) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_underline_snapshot.zig").StyleRow;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id, .raw_style = shape.underline_style_raw, .raw_color = shape.underline_color_raw };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_character_ranges(section: u32, paragraph: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const spans = s.characterRanges(a, section, paragraph) catch |err| return fail(err);
    defer a.free(spans);
    output = @import("character_ranges_wire.zig").encode(a, spans) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_table_bindings(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const bindings = s.tableBindings(a, section) catch |err| return fail(err);
    defer a.free(bindings);
    output = @import("table_bindings_wire.zig").encode(a, bindings) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_cell_size(section: u32, list_node: u32, width: u32, height: u32) u32 {
    apply(.{ .set_cell_size = .{ .section = section, .list_node = list_node, .width = width, .height = height } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_picture_current_size(section: u32, picture_node: u32, width: u32, height: u32) u32 {
    apply(.{ .set_picture_current_size = .{ .section = section, .picture_node = picture_node, .width = width, .height = height } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_resize_picture(section: u32, picture_node: u32, width: u32, height: u32) u32 {
    apply(.{ .resize_picture = .{ .section = section, .picture_node = picture_node, .width = width, .height = height } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_table_placements(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const placements = s.tablePlacements(a, section) catch |err| return fail(err);
    defer a.free(placements);
    output = @import("table_placements_wire.zig").encodeHwp5(a, placements) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_table_layout_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.tableLayoutSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_cell_layout_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.cellLayoutSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_table_anchors(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.tableAnchors(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_structural_anchors(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.structuralAnchors(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_note_shape_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.noteShapeSources(a, section) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_caption_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.captionSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_object_extras(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingObjectExtras(a, section) catch |err| return fail(err);
    defer @import("../hwp5/edit/drawing_object_extras.zig").deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_component_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingComponentSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_anchors(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingAnchors(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_list_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingListSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_matrix_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingMatrixSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_local_transforms(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingLocalTransforms(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_rectangle_corners(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingRectangleCorners(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_line_endpoints(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.drawingLineEndpoints(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_drawing_style_sources(section: u32, border_layout: u32, tail_layout: u32) u32 {
    hwp5_edit_output_free();
    const border: @import("../hwp5/body/shape_border.zig").Layout = switch (border_layout) {
        0 => .spec11,
        1 => .observed13,
        else => return fail(error.InvalidDrawingStyleLayout),
    };
    const tail: @import("../hwp5/body/drawing_style.zig").TailLayout = switch (tail_layout) {
        0 => .fill_only,
        1 => .alpha_shadow,
        2 => .alpha_shadow_metadata,
        else => return fail(error.InvalidDrawingStyleLayout),
    };
    const s = session() catch |err| return fail(err);
    const rows = s.drawingStyleSources(a, section, .{ .border = border, .tail = tail }) catch |err| return fail(err);
    defer @import("../hwp5/edit/drawing_style_sources.zig").deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_file_version() u32 {
    const s = session() catch |err| return fail(err);
    return s.fileVersion();
}
export fn hwp5_edit_picture_sources(section: u32, prefix_value: u32) u32 {
    hwp5_edit_output_free();
    const prefix: @import("../hwp5/body/shape_picture.zig").Prefix = switch (prefix_value) {
        0 => .base73,
        1 => .with_opacity74,
        2 => .with_instance78,
        else => return fail(error.InvalidPicturePrefix),
    };
    const s = session() catch |err| return fail(err);
    const rows = s.pictureSources(a, section, prefix) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_binary_resource(ordinal: u32, limit: u32) u32 {
    hwp5_edit_output_free();
    if (ordinal > 65535) return fail(error.InvalidBinaryResourceOrdinal);
    const s = session() catch |err| return fail(err);
    output = s.binaryResource(a, @intCast(ordinal), limit) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_picture_tail_sources(section: u32, layout: u32) u32 {
    hwp5_edit_output_free();
    const additional: ?@import("../hwp5/body/picture_additional.zig").Layout = switch (layout) {
        0 => null,
        1 => .dimensions8,
        2 => .with_alpha9,
        else => return fail(error.InvalidPictureTailLayout),
    };
    const s = session() catch |err| return fail(err);
    const rows = s.pictureTailSources(a, section, additional) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_note_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.noteSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_automatic_number_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.automaticNumberSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_document_properties() u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const value = s.documentProperties(a) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_master_page_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.masterPageSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_page_area_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.pageAreaSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_page_control_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.pageControlSources(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_page_settings(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const setting = s.pageSettings(a, section) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, setting, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_section_settings(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const value = s.sectionSettings(a, section) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{ .emit_strings_as_arrays = true }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_paragraph_flow(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.paragraphFlow(a, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_column_sources(section: u32) u32 {
    hwp5_edit_output_free();
    const s = session() catch |err| return fail(err);
    const rows = s.columnSources(a, section) catch |err| return fail(err);
    defer @import("../hwp5/edit/column_sources_snapshot.zig").free(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_splice(section: u32, paragraph: u32, start: u32, end: u32, ptr: [*]const u8, size: usize, policy: u32) u32 {
    if (policy > 1) return fail(error.InvalidRangePolicy);
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .splice_text = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .utf8 = ptr[0..size], .range_policy = if (policy == 1) .half_open else .reject } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_split(section: u32, paragraph: u32, at: u32) u32 {
    apply(.{ .split_paragraph = .{ .section = section, .paragraph = paragraph, .at_unit = at } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_split_range(section: u32, paragraph: u32, start: u32, end: u32) u32 {
    apply(.{ .split_paragraph = .{ .section = section, .paragraph = paragraph, .at_unit = start, .end_unit = end } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_split_with_break(section: u32, paragraph: u32, start: u32, end: u32, kind: u32) u32 {
    const intent = @import("paragraph_break.zig").decode(kind) catch |err| return fail(err);
    apply(.{ .split_paragraph = .{ .section = section, .paragraph = paragraph, .at_unit = start, .end_unit = end, .break_before = intent } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_format(section: u32, paragraph: u32, start: u32, end: u32, id: u32) u32 {
    apply(.{ .set_character_format = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .char_shape_id = id } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_properties(section: u32, paragraph: u32, start: u32, end: u32, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (mask & ~@as(u32, 7) != 0 or (mask & 2 != 0 and bold > 1) or (mask & 4 != 0 and italic > 1)) return fail(error.InvalidCharacterProperties);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{
        .size = if (mask & 1 != 0) size else null,
        .bold = if (mask & 2 != 0) bold == 1 else null,
        .italic = if (mask & 4 != 0) italic == 1 else null,
    } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_properties_ranges(ptr: [*]const u8, length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    if (mask & ~@as(u32, 7) != 0 or (mask & 2 != 0 and bold > 1) or (mask & 4 != 0 and italic > 1)) return fail(error.InvalidCharacterProperties);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{
        .size = if (mask & 1 != 0) size else null,
        .bold = if (mask & 2 != 0) bold != 0 else null,
        .italic = if (mask & 4 != 0) italic != 0 else null,
    }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
fn applyBatch(s: *Session, commands: []const edit.Command) !void {
    if (history) |*value| {
        _ = try value.applyBatch(s, commands);
    } else {
        var temporary = try History.init(a, s, 1, 128 * 1024 * 1024);
        defer temporary.deinit();
        _ = try temporary.applyBatch(s, commands);
    }
}
export fn hwp5_edit_set_character_font_ranges(ptr: [*]const u8, length: usize, language: u32, id: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const ids = @import("character_font_args.zig").decode(language, id) catch |err| return fail(err);
    @import("../model/character_fonts.zig").validateHwp5(ids) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .font_ids = ids }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_strike_ranges(ptr: [*]const u8, length: usize, value: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    if (value > 1) return fail(error.InvalidCharacterProperties);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .strike_enabled = value == 1 }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_underline_ranges(ptr: [*]const u8, length: usize, value: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const kind = @import("character_underline_args.zig").decode(value) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .underline_kind = kind }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_text_color_ranges(ptr: [*]const u8, length: usize, color: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    @import("../model/rgb_color.zig").validate(color) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .text_color = color }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_shade_ranges(ptr: [*]const u8, length: usize, kind: u32, color: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const intent = @import("character_shade_args.zig").decode(kind, color) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .shade = intent }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_effect_ranges(ptr: [*]const u8, length: usize, kind: u32, enabled: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const patch = @import("character_effect_args.zig").decode(kind, enabled) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_effect_ranges_exclusive(ptr: [*]const u8, length: usize, kind: u32, enabled: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const patch = @import("character_effect_args.zig").decodeExclusive(kind, enabled) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_outline_ranges(ptr: [*]const u8, length: usize, kind: u32) u32 {
    return setOutlineRanges(ptr, length, kind, false);
}
export fn hwp5_edit_set_character_outline_ranges_extended(ptr: [*]const u8, length: usize, kind: u32) u32 {
    return setOutlineRanges(ptr, length, kind, true);
}
fn setOutlineRanges(ptr: [*]const u8, length: usize, kind: u32, extended: bool) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const args = @import("character_outline_args.zig");
    const value = (if (extended) args.decodeHwp5(kind) else args.decode(kind)) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").build(.hwp5, a, ptr[0..length], .{ .outline_kind = value }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_replace_paragraph_ranges_font_name(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, language: u32, name_ptr: [*]const u8, name_length: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024 or name_length > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwp5, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("named_font_replacement_commands.zig").build(.hwp5, a, replacement, @fromBackingInt(@intCast(language)), name_ptr[0..name_length]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_replace_paragraph_ranges(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const s = session() catch |err| return fail(err);
    const commands = @import("paragraph_replace_request.zig").prepare(.hwp5, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_replace_paragraph_ranges_properties(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwp5, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("character_property_replacement_commands.zig").build(.hwp5, a, replacement, patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_replace_paragraph_ranges_font_name_properties(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, language: u32, name_ptr: [*]const u8, name_length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024 or name_length > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwp5, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("character_property_replacement_commands.zig").buildWithFont(.hwp5, a, replacement, @fromBackingInt(@intCast(language)), name_ptr[0..name_length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_strike(section: u32, paragraph: u32, start: u32, end: u32, value: u32) u32 {
    if (value > 1) return fail(error.InvalidCharacterProperties);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .strike_enabled = value == 1 } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_underline(section: u32, paragraph: u32, start: u32, end: u32, value: u32) u32 {
    const kind = @import("character_underline_args.zig").decode(value) catch |err| return fail(err);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .underline_kind = kind } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_underline_color(section: u32, paragraph: u32, start: u32, end: u32, color: u32) u32 {
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .underline_color = color } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_text_color(section: u32, paragraph: u32, start: u32, end: u32, color: u32) u32 {
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .text_color = color } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_shade(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, color: u32) u32 {
    const intent = @import("character_shade_args.zig").decode(kind, color) catch |err| return fail(err);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .shade = intent } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_effect(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, enabled: u32) u32 {
    const patch = @import("character_effect_args.zig").decode(kind, enabled) catch |err| return fail(err);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = patch } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_effect_exclusive(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, enabled: u32) u32 {
    const patch = @import("character_effect_args.zig").decodeExclusive(kind, enabled) catch |err| return fail(err);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = patch } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_outline(section: u32, paragraph: u32, start: u32, end: u32, kind: u32) u32 {
    const value = @import("character_outline_args.zig").decode(kind) catch |err| return fail(err);
    return setOutline(section, paragraph, start, end, value);
}
export fn hwp5_edit_set_character_outline_extended(section: u32, paragraph: u32, start: u32, end: u32, kind: u32) u32 {
    const value = @import("character_outline_args.zig").decodeHwp5(kind) catch |err| return fail(err);
    return setOutline(section, paragraph, start, end, value);
}
fn setOutline(section: u32, paragraph: u32, start: u32, end: u32, value: @import("../model/character_outline_kind.zig").Kind) u32 {
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .outline_kind = value } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_font(section: u32, paragraph: u32, start: u32, end: u32, language: u32, id: u32) u32 {
    const ids = @import("character_font_args.zig").decode(language, id) catch |err| return fail(err);
    apply(.{ .set_character_properties = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .properties = .{ .font_ids = ids } } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_font_name(section: u32, paragraph: u32, start: u32, end: u32, language: u32, ptr: [*]const u8, size: usize) u32 {
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    if (size > 4096) return fail(error.LimitExceeded);
    apply(.{ .set_character_font_name = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .language = @fromBackingInt(@intCast(language)), .name = ptr[0..size] } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_splice_font_name(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize) u32 {
    if (text_size > 4 * 1024 * 1024 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("named_font_text_commands.zig").build(.hwp5, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size], .language = @fromBackingInt(@intCast(language)), .name = name_ptr[0..name_size] }) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_splice_character_properties(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (text_size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_property_text_commands.zig").build(.hwp5, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size] }, patch) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_splice_font_name_properties(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (text_size > 4 * 1024 * 1024 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_property_text_commands.zig").buildWithFont(.hwp5, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size], .language = @fromBackingInt(@intCast(language)), .name = name_ptr[0..name_size] }, patch) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_set_character_font_name_ranges(ptr: [*]const u8, length: usize, language: u32, name_ptr: [*]const u8, name_size: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = session() catch |err| return fail(err);
    const commands = @import("character_range_commands.zig").buildFontName(.hwp5, a, ptr[0..length], @fromBackingInt(@intCast(language)), name_ptr[0..name_size]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_merge(section: u32, paragraph: u32) u32 {
    apply(.{ .merge_paragraph = .{ .section = section, .paragraph = paragraph } }) catch |err| return fail(err);
    return 1;
}
export fn hwp5_edit_save(allow_stale_layout: u32) u32 {
    hwp5_edit_output_free();
    if (allow_stale_layout > 1) return fail(error.InvalidSavePolicy);
    const s = session() catch |err| return fail(err);
    const saved = s.save(a, .{ .allow_stale_layout = allow_stale_layout == 1 }) catch |err| return fail(err);
    output = saved.bytes;
    reflow = saved.layout_requires_reflow;
    return 1;
}
