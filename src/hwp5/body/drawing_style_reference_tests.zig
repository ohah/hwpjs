const std = @import("std");
const t = std.testing;
const Component = @import("shape_component.zig").Component;
const validation = @import("drawing_style_validation.zig");
test "style image references enforce shared one-based bounds in both tail layouts" {
    var raw = [_]u8{0} ** 144;
    std.mem.writeInt(u32, raw[113..117], 2, .little);
    var p = try Component.parse(&raw, .double_id);
    p.id = 0x24726563;
    for ([_]@import("drawing_style.zig").TailLayout{ .fill_only, .alpha_shadow }) |layout| {
        p.extra = raw[100..if (layout == .fill_only) 127 else 144];
        for ([_]usize{ 0, 1, 2, 65535 }) |count| {
            for ([_]u16{ 0, 1, 2, 3, 65534, 65535 }) |id| {
                std.mem.writeInt(u16, raw[121..123], id, .little);
                var report: validation.Report = .{};
                if (id != 0 and id <= count) {
                    try report.add(p, .{ .tail = layout }, count);
                    try t.expectEqual(1, report.image_references);
                    try t.expectEqual(1, report.parsed);
                } else {
                    try t.expectError(error.InvalidShapeImageReference, report.add(p, .{ .tail = layout }, count));
                    try t.expectEqualDeep(validation.Report{}, report);
                }
            }
        }
    }
    // An inactive or unparsed field must not be looked up using plausible bytes.
    std.mem.writeInt(u16, raw[121..123], 0, .little);
    var unselected: validation.Report = .{};
    try unselected.add(p, null, 0);
    try t.expectEqual(1, unselected.unselected);
    try t.expectEqual(0, unselected.image_references);
    std.mem.writeInt(u32, raw[113..117], 0x80000002, .little);
    var unknown: validation.Report = .{};
    try unknown.add(p, .{ .tail = .alpha_shadow }, 0);
    try t.expectEqual(1, unknown.unknown);
    try t.expectEqual(0, unknown.image_references);
    p.id = 0x24706963;
    var unsupported: validation.Report = .{};
    try unsupported.add(p, .{ .tail = .alpha_shadow }, 0);
    try t.expectEqual(1, unsupported.unsupported);
    try t.expectEqual(0, unsupported.image_references);
}
