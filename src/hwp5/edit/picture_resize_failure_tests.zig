const std = @import("std");
const model = @import("../../model/document.zig");
const values = @import("picture_resize_values.zig");
const Version = @import("../version.zig").Version;

test "HWP5 resize intents remain atomic at all allocation failures for append and replacement" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    const pictures = try @import("picture_sources.zig").read(a, raw, version, .base73);
    defer a.free(pictures);
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    const original = try values.prepare(a, raw, version, @intCast(pictures[0].picture_node), .{ 10000, 6000 }, raw.len);
    for (0..3) |mode| try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, v: Version, count: usize, initial: model.PictureCurrentSize, other: u32, phase: usize) !void {
            var paragraphs: [0]model.Paragraph = .{};
            var section: model.Section = .{ .paragraphs = &paragraphs, .source_record_count = count };
            if (phase != 0) section.picture_current_sizes = try allocator.dupe(model.PictureCurrentSize, &.{initial});
            defer if (section.picture_current_sizes) |owned| allocator.free(owned);
            const node = if (phase == 2) other else initial.source_picture_node;
            values.apply(allocator, bytes, v, &section, .{ .section = 0, .picture_node = node, .width = 7000, .height = 11000 }, bytes.len) catch |err| {
                if (phase == 0) try std.testing.expect(section.picture_current_sizes == null) else try std.testing.expectEqualDeep(initial, section.picture_current_sizes.?[0]);
                return err;
            };
            const result = section.picture_current_sizes.?;
            try std.testing.expectEqual(@as(usize, if (phase == 2) 2 else 1), result.len);
            if (phase == 2) try std.testing.expectEqualDeep(initial, result[0]);
            try std.testing.expectEqual(@as(u32, 7000), result[result.len - 1].width);
            try std.testing.expectEqual(@as(u32, 11000), result[result.len - 1].height);
        }
    }.run, .{ raw, version, tree.nodes.len, original, @as(u32, @intCast(pictures[1].picture_node)), mode });
}
