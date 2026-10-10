//! 원본 쪽 설정 관찰값입니다. 현재 페이지 수나 문단 페이지 귀속이 아닙니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const geometry = @import("page_geometry.zig");
pub fn read(a: std.mem.Allocator, session: *const editor.Session) !geometry.Report {
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    return geometry.inspect(a, trees, .{});
}

test "HWPX page settings actual snapshot all allocation failures preserve source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var report = try read(allocator, source);
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), report.pages.len);
            try std.testing.expectEqual(@as(?u32, 59528), report.pages[0].width);
            try std.testing.expectEqual(@as(?u32, 84188), report.pages[0].height);
            const bytes = try std.json.Stringify.valueAlloc(allocator, report.pages, .{});
            defer allocator.free(bytes);
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
