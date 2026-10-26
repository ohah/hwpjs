const std = @import("std");
const t = std.testing;
const policy = @import("source_color_profile.zig");
const projection = @import("source_color_projection.zig");
const source = @import("border_fill_source.zig");
const header = @import("header_tree.zig");
const legacy: policy.Profile = .{ .id = "hangul-10.0.0.5060-xml1.2", .encoding = .colorref24, .verified = true };
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills><h:borderFill id='4'><c:fillBrush>";
const suffix = "</c:fillBrush></h:borderFill></h:borderFills></h:refList></h:head>";
const pattern = prefix ++ "<c:winBrush faceColor='#FFCC99' hatchColor='#FF9900' hatchStyle='CROSS' alpha='0'/>" ++ suffix;
const gradient = prefix ++ "<c:gradation type='LINEAR' angle='90' centerX='0' centerY='0' step='40' colorNum='3' stepCenter='50' alpha='0'><c:color value='#FF7F3F'/><c:color value='#FF7F3F'/><c:color value='#000000'/></c:gradation>" ++ suffix;
fn read(a: std.mem.Allocator, xml: []const u8) !source.Source {
    var tree = try header.parse(a, xml, 0, .{});
    defer tree.deinit(a);
    return source.read(a, &tree, 4);
}
test "fill semantic extension codec legacy modern unknown and unrelated fields" {
    inline for (.{ policy.Field.win_brush_hatch_color, policy.Field.gradation_color_value }) |field| {
        try t.expectEqual(@as(?u32, 0x0099ff), policy.decode(legacy, field, "#FF9900"));
        try t.expectEqual(@as(?u32, 0xff9900), policy.decode(.{}, field, "#FF9900"));
        const encoded = try policy.encode(t.allocator, legacy, field, 0x0099ff);
        defer t.allocator.free(encoded);
        try t.expectEqualStrings("#ff9900", encoded);
    }
    try t.expectEqual(@as(?u32, 0xff9900), policy.decode(legacy, .other, "#FF9900"));
    try t.expectError(error.InvalidCharacterColor, policy.encode(t.allocator, legacy, .gradation_color_value, 0x1000000));
}
test "fill semantic extension pattern raw alpha and compatibility view share canonical result" {
    var value = try read(t.allocator, pattern);
    defer value.deinit();
    const before = try std.json.Stringify.valueAlloc(t.allocator, value.fill_report.?, .{});
    defer t.allocator.free(before);
    try projection.enrich(&value, legacy);
    const all = value.semantic_fill_colors.?;
    try t.expectEqual(@as(usize, 2), all.len);
    try t.expectEqual(all[0].node, all[1].node);
    try t.expectEqualStrings("winBrush.faceColor", all[0].field);
    try t.expectEqualStrings("winBrush.hatchColor", all[1].field);
    try t.expectEqual(@as(?u32, 0x99ccff), all[0].rgb);
    try t.expectEqual(@as(?u32, 0x0099ff), all[1].rgb);
    try t.expectEqualDeep(all[0], value.semantic_face_colors.?[0]);
    const after = try std.json.Stringify.valueAlloc(t.allocator, value.fill_report.?, .{});
    defer t.allocator.free(after);
    try t.expectEqualSlices(u8, before, after);
    try t.expectEqualStrings("0", value.fill_report.?.nodes[0].get(.win_alpha).?);
    try t.expectError(error.SourceColorAlreadyProjected, projection.enrich(&value, .{}));
}
test "fill semantic extension gradient retains repeated raw stops source order and nodes" {
    var value = try read(t.allocator, gradient);
    defer value.deinit();
    try projection.enrich(&value, legacy);
    const all = value.semantic_fill_colors.?;
    try t.expectEqual(@as(usize, 3), all.len);
    try t.expectEqual(@as(usize, 0), value.semantic_face_colors.?.len);
    for (all, 0..) |color, i| {
        try t.expectEqualStrings("color.value", color.field);
        try t.expectEqual(value.fill_report.?.nodes[i + 1].element_index, color.node);
        try t.expectEqual(@as(?u32, if (i < 2) 0x3f7fff else 0), color.rgb);
        if (i > 0) try t.expect(all[i - 1].node != color.node);
    }
}
test "fill semantic extension inactive sentinel stays explicit null without poisoning solid face" {
    var value = try read(t.allocator, prefix ++ "<c:winBrush faceColor='#A5E7E7' hatchColor='#FFFFFFFF' alpha='0'/>" ++ suffix);
    defer value.deinit();
    try projection.enrich(&value, legacy);
    try t.expectEqual(@as(usize, 2), value.semantic_fill_colors.?.len);
    try t.expectEqual(@as(?u32, 0xe7e7a5), value.semantic_fill_colors.?[0].rgb);
    try t.expect(value.semantic_fill_colors.?[1].rgb == null);
    try t.expectEqual(@as(?u32, 0xe7e7a5), value.semantic_face_colors.?[0].rgb);
    try t.expectEqualStrings("#FFFFFFFF", value.fill_report.?.nodes[0].get(.hatch_color).?);
}
test "fill semantic extension absent fields stay absent and unknown profile remains RGB" {
    var empty = try read(t.allocator, prefix ++ "<c:winBrush alpha='0'/>" ++ suffix);
    defer empty.deinit();
    try projection.enrich(&empty, .{});
    try t.expectEqual(@as(usize, 0), empty.semantic_fill_colors.?.len);
    var value = try read(t.allocator, pattern);
    defer value.deinit();
    try projection.enrich(&value, .{});
    try t.expectEqual(@as(?u32, 0xffcc99), value.semantic_fill_colors.?[0].rgb);
    try t.expectEqual(@as(?u32, 0xff9900), value.semantic_fill_colors.?[1].rgb);
}
test "fill semantic extension forged parent refuses before semantic installation without panic" {
    for ([_]?usize{ null, 1, std.math.maxInt(usize) }) |bad| {
        var value = try read(t.allocator, gradient);
        defer value.deinit();
        value.fill_report.?.nodes[1].parent_node_index = bad;
        try t.expectError(error.SourceBindingMismatch, projection.enrich(&value, legacy));
        try t.expect(value.semantic_fill_colors == null and value.semantic_face_colors == null and value.source_color_profile == null);
    }
}
fn oom(a: std.mem.Allocator, xml: []const u8) !void {
    var value = try read(a, xml);
    defer value.deinit();
    try projection.enrich(&value, legacy);
    const bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(bytes);
    try t.expect(std.mem.indexOf(u8, bytes, "semantic_fill_colors") != null);
    try t.expect(value.semantic_fill_colors.?.len > 0);
}
test "fill semantic extension allocation failures clean all owned raw and derived arrays" {
    for ([_][]const u8{ pattern, gradient }) |xml| {
        var counter = t.FailingAllocator.init(t.allocator, .{});
        var nr: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
        try oom(nr.allocator(), xml);
        if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
        try @import("../testing/allocation_failures.zig").check(oom, .{xml});
    }
}
test "fill semantic extension actual bound pattern and gradient owners keep source raw" {
    const cases = [_]struct { path: []const u8, id: u32, field: []const u8, rgb: u32 }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwpx", .id = 6, .field = "winBrush.hatchColor", .rgb = 0x0099ff },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", .id = 5, .field = "color.value", .rgb = 0x3f7fff },
    };
    for (cases) |case| {
        const input = try std.Io.Dir.cwd().readFileAlloc(t.io, case.path, t.allocator, .limited(32_000_000));
        defer t.allocator.free(input);
        var session = try @import("editor_session.zig").open(t.allocator, input, .{});
        defer session.deinit();
        var report = try @import("table_border_sources.zig").read(t.allocator, &session, 0);
        defer report.deinit(t.allocator);
        var found = false;
        for (report.styles) |style| {
            if (style.id != case.id) continue;
            for (style.semantic_fill_colors.?) |color| {
                if (std.mem.eql(u8, color.field, case.field) and color.rgb == case.rgb) found = true;
            }
        }
        try t.expect(found);
        const saved = try session.save();
        defer t.allocator.free(saved);
        try t.expectEqualSlices(u8, input, saved);
    }
}
