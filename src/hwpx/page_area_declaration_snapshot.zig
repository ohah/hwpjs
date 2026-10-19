//! Request-local declaration coordinates from the authoritative current paragraphs.
const std = @import("std");
const editor = @import("editor_session.zig");
const position = @import("page_area_position.zig");

pub const Row = struct {
    paragraph: usize,
    source_element: usize,
    source_control: usize,
    unit: u32,
    affinity: @import("zero_width_coordinate.zig").Affinity,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var rows: std.ArrayList(Row) = .empty;
    defer rows.deinit(a);
    var owners: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer owners.deinit(a);
    for (current.paragraphs, 0..) |*paragraph, ordinal| {
        const source = @import("page_area_source_positions.zig");
        if (paragraph.page_area_positions) |positions| {
            try @import("page_area_current_validate.zig").validatePartitionMember(a, &section.tree, paragraph);
            try append(a, &rows, &owners, section.first_paragraph, ordinal, positions);
        } else if (source.hasForParagraph(&section.tree, paragraph.template_element)) {
            if (paragraph.pieces != null) return error.UnsupportedPageAreaOwnership;
            if (paragraph.generated_id != null) {
                // Implicit continuations retain text/style templates, not declarations.
                // Require their unique original owner instead of collecting twice.
                var originals: usize = 0;
                for (current.paragraphs) |original| {
                    if (original.template_element == paragraph.template_element and original.generated_id == null and original.source_ordinal != null) originals += 1;
                }
                if (originals != 1) return error.SourceBindingMismatch;
                continue;
            }
            const segments = try @import("paragraph_protected_positions.zig").build(a, &section.tree, paragraph);
            defer a.free(segments);
            const positions = try source.collect(a, &section.tree, paragraph.template_element, segments, 100000);
            defer a.free(positions);
            try append(a, &rows, &owners, section.first_paragraph, ordinal, positions);
        }
    }
    return rows.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, rows: *std.ArrayList(Row), owners: *std.AutoHashMapUnmanaged(usize, void), first: usize, ordinal: usize, positions: []const position.Position) !void {
    const paragraph = std.math.add(usize, first, ordinal) catch return error.LimitExceeded;
    for (positions) |item| {
        if (rows.items.len >= 100000) return error.LimitExceeded;
        const entry = try owners.getOrPut(a, item.source_element);
        if (entry.found_existing) return error.SourceBindingMismatch;
        try rows.append(a, .{ .paragraph = paragraph, .source_element = item.source_element, .source_control = item.source_control, .unit = item.unit, .affinity = item.affinity });
    }
}

test "page area declaration snapshot follows real preceding split and releases every failed query" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 2), before.len);
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    const after = try read(a, &session, 0);
    defer a.free(after);
    for (before, after) |old, row| {
        try std.testing.expectEqual(old.paragraph + 1, row.paragraph);
        try std.testing.expectEqual(old.source_element, row.source_element);
        try std.testing.expectEqual(old.unit, row.unit);
    }
    const saved = try session.save();
    defer a.free(saved);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, live: *const editor.Session) !void {
            const rows = try read(allocator, live, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 2), rows.len);
            try std.testing.expectEqual(@as(usize, 3), rows[0].paragraph);
        }
    }.run, .{&session});
    const saved_after = try session.save();
    defer a.free(saved_after);
    try std.testing.expectEqualSlices(u8, saved, saved_after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "page area declaration snapshot preserves owner split coordinates and rejects corrupt ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const implicit = try read(a, &session, 0);
    defer a.free(implicit);
    try @import("page_area_materialize.zig").install(a, &session.sections[0].tree, &session.sections[0].structure_values.?.paragraphs[1], 2);
    const current = try read(a, &session, 0);
    defer a.free(current);
    try std.testing.expectEqualDeep(implicit, current);
    try std.testing.expectEqual(@as(usize, 2), current.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const restored = try read(a, &reopened, 0);
    defer a.free(restored);
    try std.testing.expectEqual(current.len, restored.len);
    for (current, restored) |before, after| {
        try std.testing.expectEqual(before.paragraph, after.paragraph);
        try std.testing.expectEqual(before.unit, after.unit);
        try std.testing.expectEqual(before.affinity, after.affinity);
    }
    const positions = session.sections[0].structure_values.?.paragraphs[1].page_area_positions.?;
    const original = positions[1];
    positions[1] = positions[0];
    try std.testing.expectError(error.SourceBindingMismatch, read(a, &session, 0));
    positions[1] = original;
    const after_refusal = try session.save();
    defer a.free(after_refusal);
    try std.testing.expectEqualSlices(u8, saved, after_refusal);
}

test "page area declaration snapshot reads actual nested source owners without editing" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx", a, .limited(8000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const rows = try read(a, &session, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 3), rows.len);
    const expected = [_][2]usize{ .{ 262, 18 }, .{ 9506, 956 }, .{ 9739, 963 } };
    for (rows, expected) |row, pair| {
        try std.testing.expectEqual(pair[0], row.source_element);
        try std.testing.expectEqual(pair[1], row.paragraph);
    }
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expectEqualSlices(u8, input, session.source);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, 99));
}
