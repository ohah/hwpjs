//! Owned model values for undo. Immutable format sidecars stay in Session.
const std = @import("std");
const model = @import("../../model/document.zig");
const clone = @import("../../model/clone.zig");

test "HWP5 checkpoint picture current sizes clone budget exchange and invalid identity under failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var paragraphs: [0]model.Paragraph = .{};
            var pictures = [_]model.PictureCurrentSize{.{ .source_picture_node = 1, .width = 0, .height = 6000, .resize_matrices = .{ .translation = .{ 1, 0, 10, 0, 1, 20 }, .scale = .{ 1, 0, 0, 0, 1, 0 }, .scale_index = 0, .display = .{ 10000, 6000 } } }};
            const sections = try a.alloc(model.Section, 1);
            sections[0] = clone.section(a, .{ .paragraphs = &paragraphs, .source_record_count = 2, .picture_current_sizes = &pictures }) catch |err| {
                a.free(sections);
                return err;
            };
            var document: model.Document = .{ .format = .hwp5, .sections = sections };
            defer document.deinit(a);
            var owner: u8 = 0;
            const required = try size(&document, 10000);
            var empty = document.sections[0];
            empty.picture_current_sizes = null;
            var empty_sections = [_]model.Section{empty};
            const empty_document: model.Document = .{ .format = .hwp5, .sections = &empty_sections };
            try std.testing.expectEqual(@as(usize, @sizeOf(model.PictureCurrentSize)), required - try size(&empty_document, 10000));
            try std.testing.expectError(error.LimitExceeded, capture(a, &owner, &document, required - 1));
            const checkpoint = try capture(a, &owner, &document, required);
            defer checkpoint.deinit();
            try std.testing.expect(try matches(checkpoint, a, &owner, &document));
            document.sections[0].picture_current_sizes.?[0].width = 10000;
            document.sections[0].picture_current_sizes.?[0].resize_matrices.?.scale[0] = 2;
            try std.testing.expect(!try matches(checkpoint, a, &owner, &document));
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqual(@as(u32, 0), document.sections[0].picture_current_sizes.?[0].width);
            try std.testing.expectEqual(@as(f64, 1), document.sections[0].picture_current_sizes.?[0].resize_matrices.?.scale[0]);
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqual(@as(u32, 10000), document.sections[0].picture_current_sizes.?[0].width);
            try std.testing.expectEqual(@as(f64, 2), document.sections[0].picture_current_sizes.?[0].resize_matrices.?.scale[0]);
            document.sections[0].picture_current_sizes.?[0].source_picture_node = 2;
            try std.testing.expectError(error.SourceBindingMismatch, matches(checkpoint, a, &owner, &document));
        }
    }.run, .{});
}

test "HWP5 checkpoint font intents own names and exchange under allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var document: model.Document = .{ .format = .hwp5, .sections = try a.alloc(model.Section, 0) };
            defer document.deinit(a);
            _ = try document.font_resources.add(a, .hangul, 0, "Font", 4);
            var owner: u8 = 0;
            const required = try size(&document, 4096);
            try std.testing.expectError(error.LimitExceeded, capture(a, &owner, &document, required - 1));
            const checkpoint = try capture(a, &owner, &document, 4096);
            defer checkpoint.deinit();
            try std.testing.expect(try matches(checkpoint, a, &owner, &document));
            document.font_resources.entries.items[0].name.?[0] = 'X';
            try std.testing.expect(!try matches(checkpoint, a, &owner, &document));
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqualStrings("Font", document.font_resources.entries.items[0].name.?);
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqualStrings("Xont", document.font_resources.entries.items[0].name.?);
        }
    }.run, .{});
}

test "HWP5 checkpoint character intents exchange undo redo without allocation" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var document: model.Document = .{ .format = .hwp5, .sections = try a.alloc(model.Section, 0) };
            defer document.deinit(a);
            document.character_resources = try a.dupe(model.CharacterResourceIntent, &.{.{ .source_id = 0, .properties = .{ .size = 1200, .bold = false, .underline_kind = .none } }});
            var owner: u8 = 0;
            const checkpoint = try capture(a, &owner, &document, 4096);
            defer checkpoint.deinit();
            document.character_resources[0].properties.size = 2400;
            document.character_resources[0].properties.bold = true;
            document.character_resources[0].properties.underline_kind = .top;
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqual(@as(?i32, 1200), document.character_resources[0].properties.size);
            try std.testing.expectEqual(@as(?bool, false), document.character_resources[0].properties.bold);
            try std.testing.expectEqual(model.CharacterUnderlineKind.none, document.character_resources[0].properties.underline_kind.?);
            try exchange(checkpoint, a, &owner, &document);
            try std.testing.expectEqual(@as(?i32, 2400), document.character_resources[0].properties.size);
            try std.testing.expectEqual(@as(?bool, true), document.character_resources[0].properties.bold);
            try std.testing.expectEqual(model.CharacterUnderlineKind.top, document.character_resources[0].properties.underline_kind.?);
            const with_resources = try size(&document, 4096);
            var empty = document;
            empty.character_resources = &.{};
            try std.testing.expectEqual(@sizeOf(model.CharacterResourceIntent), with_resources - try size(&empty, 4096));
            try std.testing.expectError(error.LimitExceeded, capture(a, &owner, &document, with_resources - 1));
        }
    }.run, .{});
}

test "HWP5 checkpoint resource intents clone independently at every allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var resources = [_]model.ParagraphResourceIntent{.{ .source_id = 0, .alignment = 3 }};
            var characters = [_]model.CharacterResourceIntent{.{ .source_id = 1, .properties = .{ .size = 1200, .bold = true } }};
            const document: model.Document = .{ .format = .hwp5, .sections = &.{}, .paragraph_resources = &resources, .character_resources = &characters };
            var owner: u8 = 0;
            const snapshot = try capture(a, &owner, &document, 4096);
            defer snapshot.deinit();
            try std.testing.expect(try matches(snapshot, a, &owner, &document));
            resources[0].alignment = 2;
            try std.testing.expect(!try matches(snapshot, a, &owner, &document));
            const state: *const State = @ptrCast(@alignCast(snapshot));
            try std.testing.expectEqual(@as(u3, 3), state.document.paragraph_resources[0].alignment);
            resources[0].alignment = 3;
            characters[0].properties.size = 2400;
            try std.testing.expect(!try matches(snapshot, a, &owner, &document));
            try std.testing.expectEqual(@as(?i32, 1200), state.document.character_resources[0].properties.size);
            characters[0].properties.size = 1200;
            characters[0].properties.bold = null;
            try std.testing.expect(!try matches(snapshot, a, &owner, &document));
            const required = try size(&document, 4096);
            try std.testing.expectError(error.LimitExceeded, size(&document, required - 1));
        }
    }.run, .{});
}

test "HWP5 checkpoint owns cell size across every capture allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var sizes = [_]model.TableCellSize{.{ .source_list_node = 1, .width = 10, .height = 20 }};
            var paragraphs: [0]model.Paragraph = .{};
            var sections = [_]model.Section{.{ .paragraphs = &paragraphs, .source_record_count = 2, .table_cell_sizes = &sizes }};
            const source: model.Document = .{ .format = .hwp5, .sections = &sections };
            var owner: u8 = 0;
            const checkpoint = capture(a, &owner, &source, 10000) catch |err| {
                try std.testing.expectEqual(@as(u32, 10), sizes[0].width);
                return err;
            };
            defer checkpoint.deinit();
            sizes[0].width = 30;
            const state: *const State = @ptrCast(@alignCast(checkpoint));
            try std.testing.expectEqual(@as(u32, 10), state.document.sections[0].table_cell_sizes.?[0].width);
            try std.testing.expect(!try matches(checkpoint, a, &owner, &source));
        }
    }.run, .{});
}

test "HWP5 checkpoint owns cell size values and includes them in equality and budget" {
    const a = std.testing.allocator;
    const sections = try a.alloc(model.Section, 1);
    const paragraphs = a.alloc(model.Paragraph, 0) catch |err| {
        a.free(sections);
        return err;
    };
    const sizes = a.alloc(model.TableCellSize, 1) catch |err| {
        a.free(paragraphs);
        a.free(sections);
        return err;
    };
    sizes[0] = .{ .source_list_node = 1, .width = 10, .height = 20 };
    sections[0] = .{ .paragraphs = paragraphs, .source_record_count = 2, .table_cell_sizes = sizes };
    var document: model.Document = .{ .format = .hwp5, .sections = sections };
    defer document.deinit(a);
    var owner: u8 = 0;
    const checkpoint = try capture(a, &owner, &document, 10000);
    defer checkpoint.deinit();
    try std.testing.expect(try matches(checkpoint, a, &owner, &document));
    document.sections[0].table_cell_sizes.?[0].width = 1234;
    try std.testing.expect(!try matches(checkpoint, a, &owner, &document));
    const required = try size(&document, 10000);
    try std.testing.expectError(error.LimitExceeded, size(&document, required - 1));
    try exchange(checkpoint, a, &owner, &document);
    try std.testing.expectEqual(@as(u32, 10), document.sections[0].table_cell_sizes.?[0].width);
    try exchange(checkpoint, a, &owner, &document);
    try std.testing.expectEqual(@as(u32, 1234), document.sections[0].table_cell_sizes.?[0].width);
    document.sections[0].table_cell_sizes.?[0].source_list_node = 2;
    try std.testing.expectError(error.SourceBindingMismatch, matches(checkpoint, a, &owner, &document));
}

const State = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: model.Document,
    max_bytes: usize,
};

/// Opaque to avoid exposing mutable copies as a second public document model.
/// Must be released before its originating Session is closed.
pub const Checkpoint = opaque {
    pub fn deinit(self: *Checkpoint) void {
        const state: *State = @ptrCast(@alignCast(self));
        const a = state.allocator;
        state.document.deinit(a);
        a.destroy(state);
    }
};

pub fn capture(a: std.mem.Allocator, owner: *const anyopaque, source: *const model.Document, max_bytes: usize) !*Checkpoint {
    _ = try size(source, max_bytes);
    const sections = try a.alloc(model.Section, source.sections.len);
    var initialized: usize = 0;
    errdefer {
        for (sections[0..initialized]) |*section| section.deinit(a);
        a.free(sections);
    }
    for (source.sections, sections) |section, *out| {
        out.* = try clone.section(a, section);
        initialized += 1;
    }
    const state = try a.create(State);
    errdefer a.destroy(state);
    const resources = try a.dupe(model.ParagraphResourceIntent, source.paragraph_resources);
    errdefer a.free(resources);
    const characters = try a.dupe(model.CharacterResourceIntent, source.character_resources);
    errdefer a.free(characters);
    const fonts = try source.font_resources.clone(a);
    state.* = .{ .allocator = a, .owner = owner, .document = .{ .format = source.format, .coverage = source.coverage, .sections = sections, .paragraph_resources = resources, .character_resources = characters, .font_resources = fonts }, .max_bytes = max_bytes };
    return @ptrCast(state);
}

/// Allocation-free swap, retaining replaced values for redo.
pub fn exchange(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *model.Document) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    _ = try size(current, state.max_bytes);
    std.mem.swap(model.Document, &state.document, current);
}

pub fn matches(checkpoint: *const Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *const model.Document) !bool {
    const state: *const State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    return @import("../../model/equality.zig").document(state.document, current.*);
}

/// Transaction rollback validates the preserved destination, not rejected growth.
pub fn rollback(checkpoint: *Checkpoint, a: std.mem.Allocator, owner: *const anyopaque, current: *model.Document) !void {
    const state: *State = @ptrCast(@alignCast(checkpoint));
    try bind(state, a, owner, current);
    _ = try size(&state.document, state.max_bytes);
    std.mem.swap(model.Document, &state.document, current);
}

fn bind(state: *const State, a: std.mem.Allocator, owner: *const anyopaque, current: *const model.Document) !void {
    if (state.owner != owner or state.allocator.ptr != a.ptr or state.allocator.vtable != a.vtable or state.document.format != current.format or state.document.coverage != current.coverage or state.document.sections.len != current.sections.len) return error.SourceBindingMismatch;
    for (state.document.sections, current.sections) |before, after| {
        if (before.source_record_count != after.source_record_count) return error.SourceBindingMismatch;
        try validateProvenance(before);
        try validateProvenance(after);
    }
}

fn validateProvenance(section: model.Section) !void {
    if (section.form_values) |values| for (values, 0..) |value, i| {
        if (value.source_node >= section.source_record_count or value.text.len % 2 != 0) return error.SourceBindingMismatch;
        if (i > 0 and values[i - 1].source_node >= value.source_node) return error.SourceBindingMismatch;
    };
    if (section.picture_current_sizes) |values| for (values) |value| {
        if (value.source_picture_node >= section.source_record_count) return error.SourceBindingMismatch;
    };
    if (section.table_cell_sizes) |values| for (values) |value| {
        if (value.source_list_node >= section.source_record_count) return error.SourceBindingMismatch;
    };
    for (section.paragraphs) |p| {
        if (p.parent_node) |parent| if (parent >= section.source_record_count) return error.SourceBindingMismatch;
        if (p.source_node) |node| {
            if (node >= section.source_record_count or p.header_template != null) return error.SourceBindingMismatch;
        } else {
            const template = p.header_template orelse return error.SourceBindingMismatch;
            if (template >= section.source_record_count or p.instance_id == 0) return error.SourceBindingMismatch;
        }
    }
}

pub fn size(document: *const model.Document, limit: usize) !usize {
    var total: usize = 0;
    try add(&total, 1, @sizeOf(State), limit);
    try add(&total, document.sections.len, @sizeOf(model.Section), limit);
    try add(&total, document.paragraph_resources.len, @sizeOf(model.ParagraphResourceIntent), limit);
    try add(&total, document.character_resources.len, @sizeOf(model.CharacterResourceIntent), limit);
    try add(&total, document.font_resources.entries.capacity, @sizeOf(@import("../../model/font_face_value.zig").Value), limit);
    for (document.font_resources.entries.items) |font| if (font.name) |name| try add(&total, name.len, 1, limit);
    for (document.sections) |section| {
        if (section.form_values) |values| {
            try add(&total, values.len, @sizeOf(@import("../../model/form_values.zig").Value), limit);
            for (values) |value| try add(&total, value.text.len, 1, limit);
        }
        if (section.picture_current_sizes) |values| try add(&total, values.len, @sizeOf(model.PictureCurrentSize), limit);
        if (section.table_cell_sizes) |values| try add(&total, values.len, @sizeOf(model.TableCellSize), limit);
        try add(&total, section.paragraphs.len, @sizeOf(model.Paragraph), limit);
        for (section.paragraphs) |paragraph| {
            try add(&total, paragraph.tokens.len, @sizeOf(model.Token), limit);
            for (paragraph.tokens) |token| try add(&total, token.raw.len, 1, limit);
            try add(&total, paragraph.character_runs.len, @sizeOf(model.CharacterRun), limit);
            if (paragraph.range_tags) |values| try add(&total, values.len, @sizeOf(model.TextRange), limit);
            if (paragraph.field_attributes) |values| try add(&total, values.len, @sizeOf(model.FieldAttributes), limit);
            if (paragraph.formula_results) |values| {
                try add(&total, values.len, @sizeOf(model.FormulaResult), limit);
                for (values) |value| if (value.expression) |expression| try add(&total, expression.len, 1, limit);
            }
        }
    }
    return total;
}
fn add(total: *usize, count: usize, width: usize, limit: usize) !void {
    const amount = std.math.mul(usize, count, width) catch return error.LimitExceeded;
    if (amount > limit -| total.*) return error.LimitExceeded;
    total.* += amount;
}
