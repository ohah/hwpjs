//! All bound drawing text snapshots; no retained revision cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const snapshots = @import("drawing_text_snapshot.zig");

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]snapshots.Snapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const bindings = try @import("drawing_text_bindings.zig").readCurrent(a, section, current.paragraphs);
    defer a.free(bindings);
    var seen: std.AutoHashMap(usize, void) = .init(a);
    defer seen.deinit();
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (bindings) |binding| {
        const entry = try seen.getOrPut(binding.owner.drawing_node);
        if (entry.found_existing) continue;
        if (nodes.items.len >= 100000) return error.LimitExceeded;
        try nodes.append(a, binding.owner.drawing_node);
    }
    std.mem.sort(usize, nodes.items, {}, std.sort.asc(usize));
    const result = try a.alloc(snapshots.Snapshot, nodes.items.len);
    errdefer a.free(result);
    for (nodes.items, result) |node, *value| {
        const host = try @import("rectangle_display_host.zig").readCurrent(a, section, current.paragraphs, node);
        value.* = try snapshots.readWithHost(a, &section.tree, node, host);
    }
    return result;
}

test "HWPX drawing snapshot batch allocation failures preserve source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const expected = try read(a, &session, 0);
    defer a.free(expected);
    try std.testing.expectEqual(@as(usize, 2), expected.len);
    for (expected) |row| try std.testing.expectEqualDeep(try snapshots.read(a, &session, 0, row.drawing_node), row);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, baseline: []const snapshots.Snapshot) !void {
            const rows = try read(allocator, state, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(baseline, rows);
        }
    }.run, .{ &session, expected });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
