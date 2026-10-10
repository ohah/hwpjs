//! 기존 구역 주석 모양 검사기를 현재 Session 트리에 연결합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const shapes = @import("section_note_shapes.zig");
pub fn read(a: std.mem.Allocator, session: *const editor.Session) !shapes.Report {
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    return shapes.inspect(a, trees, .{});
}

test "HWPX note shapes snapshot allocation failures preserve source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session) !void {
            var report = try read(allocator, state);
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), report.notes.len);
            try std.testing.expectEqual(@as(usize, 10), report.children.len);
            const bytes = try std.json.Stringify.valueAlloc(allocator, report, .{});
            defer allocator.free(bytes);
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
