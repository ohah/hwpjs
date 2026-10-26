//! Detached source geometry JSON; does not grant layout or editing support.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section: usize, node: usize) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var value = try @import("curve_geometry_values.zig").read(a, &session.sections[section].tree, node, .{});
    defer value.deinit();
    const common = try @import("shape_common_source.zig").read(a, &session.sections[section].tree, node, .curve);
    const text = try @import("drawing_text_values.zig").read(a, &session.sections[section].tree, node);
    return std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .node = node, .segments = value.segments, .common = common, .text = text }, .{});
}

test "curve source encoding owns JSON and cleans every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/3-09월_교육_통합_2022.hwpx", a, .limited(16_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const expected = try encode(a, &session, 0, 1924);
    defer a.free(expected);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, state: *const @import("editor_session.zig").Session, baseline: []const u8) !void {
            const encoded = try encode(allocator, state, 0, 1924);
            defer allocator.free(encoded);
            try std.testing.expectEqualStrings(baseline, encoded);
        }
    }.run, .{ &session, expected });
    try std.testing.expectError(error.InvalidSectionIndex, encode(a, &session, 999, 1924));
    try std.testing.expectError(error.InvalidCurveGeometryNode, encode(a, &session, 0, 0));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
