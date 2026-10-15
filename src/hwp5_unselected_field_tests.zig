const std = @import("std");
const policy = @import("hwp5/edit/source_policy.zig");

test "unselected field policy validates actual click bindings and all allocation failures" {
    try @import("testing/checked_allocator.zig").run(actualClickBindings, .{});
}

fn actualClickBindings(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const original = try a.dupe(u8, bytes);
    defer a.free(original);
    try std.testing.expect(try policy.hasNamedFields(bytes));
    try std.testing.expectError(error.UnsupportedSectionControl, policy.validate(a, bytes, source.header.version()));
    try policy.validateUnselectedSection(a, bytes, source.header.version());
    try @import("testing/allocation_failures.zig").check(policy.validateUnselectedSection, .{ bytes, source.header.version() });
    try std.testing.expectEqualSlices(u8, original, bytes);
    var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const mutated = try a.dupe(u8, bytes);
    defer a.free(mutated);
    const controls = @import("hwp5/body/control_rules.zig");
    var exercised = false;
    for (tree.nodes) |node| {
        const payload = node.record.framing.payload;
        if (node.record.framing.tag != 71 or payload.len < 4 or std.mem.readInt(u32, payload[0..4], .little) != controls.id("%clk")) continue;
        const offset = @intFromPtr(payload.ptr) - @intFromPtr(bytes.ptr);
        std.mem.writeInt(u32, mutated[offset..][0..4], controls.id("%bmk"), .little);
        try std.testing.expectError(error.FieldMarkerMismatch, policy.validateUnselectedSection(a, mutated, source.header.version()));
        exercised = true;
        break;
    }
    try std.testing.expect(exercised);
}

test "unselected field policy keeps formulas unknown fields and unknown controls blocked" {
    const a = std.testing.allocator;
    const controls = @import("hwp5/body/control_rules.zig");
    const version: @import("hwp5/version.zig").Version = .{ .raw = 0x05010001 };
    for ([_]u32{ controls.id("%fmu"), controls.id("%usr"), controls.id("zzzz") }) |id| {
        var source: [8]u8 = undefined;
        std.mem.writeInt(u32, source[0..4], 71 | (@as(u32, 4) << 20), .little);
        std.mem.writeInt(u32, source[4..8], id, .little);
        try std.testing.expectError(error.UnsupportedSectionControl, policy.validateUnselectedSection(a, &source, version));
    }
}
