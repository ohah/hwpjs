const std = @import("std");

test "line break split draft every allocation failure preserves actual source and model" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/distribution.hwp", a, .limited(4000000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const paragraph = document.sections[0].paragraphs[114];
    const before = try @import("plain_text_content.zig").textBytes(a, paragraph);
    defer a.free(before);
    const line = for (paragraph.tokens) |token| {
        if (token.kind == .control and token.raw.len == 2 and std.mem.readInt(u16, token.raw[0..2], .little) == 10) break token.start_unit;
    } else return error.ExpectedLineBreak;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, p: @import("../../model/document.zig").Paragraph, cut: u32, expected: []const u8) !void {
            var draft = try @import("paragraph_split.zig").prepare(allocator, bytes, version, p, cut, 0xfffffffe, 1000);
            defer draft.deinit(allocator);
            const left = try @import("plain_text_content.zig").textBytes(allocator, draft.left);
            defer allocator.free(left);
            const right = try @import("plain_text_content.zig").textBytes(allocator, draft.right);
            defer allocator.free(right);
            try std.testing.expectEqualSlices(u8, expected[0 .. @as(usize, cut) * 2], left[0 .. left.len - 2]);
            try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, left[left.len - 2 ..]);
            try std.testing.expectEqualSlices(u8, expected[@as(usize, cut) * 2 ..], right);
        }
    };
    for ([_]u32{ 0, line, line + 1, @intCast(before.len / 2 - 1) }) |cut| try std.testing.checkAllAllocationFailures(a, Probe.run, .{ @as([]const u8, raw), source.header.version(), paragraph, cut, @as([]const u8, before) });
    const after = try @import("plain_text_content.zig").textBytes(a, document.sections[0].paragraphs[114]);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
