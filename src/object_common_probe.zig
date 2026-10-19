test {
    _ = @import("hwp5/body/object_tests.zig");
}

test "object short actual saved drawing controls retain absence without modifying section bytes" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const before = try a.dupe(u8, bytes);
    defer a.free(before);
    var tree = try @import("hwp5/body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const header = node.record.value.control_header;
        if (header.id != @import("hwp5/body/control_rules.zig").drawing_id or header.properties.len != 36) continue;
        const properties = try @import("hwp5/body/object_common.zig").parseControl(header);
        try std.testing.expect(!properties.prevent_page_break_present);
        try std.testing.expectError(error.UnexpectedEnd, @import("hwp5/body/object_common.zig").Properties.parse(header.properties));
        const raw = node.record.framing.payload;
        const same = try @import("hwp5/edit/object_size_payload.zig").write(a, raw, .{ properties.width, properties.height }, raw.len);
        defer a.free(same);
        try std.testing.expectEqualSlices(u8, raw, same);
        const resized = try @import("hwp5/edit/object_size_payload.zig").write(a, raw, .{ 1000, 2000 }, raw.len);
        defer a.free(resized);
        try std.testing.expectEqual(raw.len, resized.len);
        try std.testing.expectEqualSlices(u8, raw[0..16], resized[0..16]);
        try std.testing.expectEqualSlices(u8, raw[24..], resized[24..]);
        const resized_header = try @import("hwp5/body/control_header.zig").Header.parse(resized);
        try std.testing.expect(!(try @import("hwp5/body/object_common.zig").parseControl(resized_header)).prevent_page_break_present);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 5), count);
    try std.testing.expectEqualSlices(u8, before, bytes);
}
