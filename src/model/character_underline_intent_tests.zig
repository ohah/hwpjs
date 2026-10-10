const std = @import("std");

test "underline intent combines size emphasis and position in complete HWPX header" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:charProperties itemCnt='1'><h:charPr id='9' height='1379'><h:italic/><h:underline type='BOTTOM' shape='WAVE' color='#123456'/></h:charPr><!--keep--></h:charProperties></h:refList></h:head>";
    var tree = try @import("../hwpx/xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("../hwpx/xml_part_tree.zig").Tree) !void {
            var values: @import("../hwpx/character_resource_values.zig").Values = .{};
            defer values.deinit(allocator);
            const id = try values.add(allocator, &.{9}, 9, .{ .size = 2400, .bold = true, .italic = false, .underline_kind = .center });
            try std.testing.expectEqual(@as(u32, 0), id);
            const entry = values.entries.items[0];
            const output = try @import("../hwpx/character_resource_insert.zig").write(allocator, input, 3, entry.id, entry.properties, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:charProperties itemCnt='2'><h:charPr id='9' height='1379'><h:italic/><h:underline type='BOTTOM' shape='WAVE' color='#123456'/></h:charPr><!--keep--><h:charPr id='0' height='2400'><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><h:underline type='CENTER' shape='WAVE' color='#123456'/></h:charPr></h:charProperties></h:refList></h:head>", output);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "underline intent rejects unsupported HWP5 CENTER before resource mutation" {
    const a = std.testing.allocator;
    var values: @import("../hwp5/edit/character_resource_values.zig").Values = .{};
    defer values.deinit(a);
    try std.testing.expectError(error.UnsupportedCharacterUnderlineKind, values.add(a, 1, 0, .{ .underline_kind = .center }));
    try std.testing.expectEqual(@as(usize, 0), values.entries.items.len);
}

test "underline intent empty HWPX selection stays unchanged and HWP5 CENTER remains rejected" {
    const a = std.testing.allocator;
    const hwpx = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(hwpx);
    var xml = try @import("../hwpx/editor_session.zig").open(a, hwpx, .{});
    defer xml.deinit();
    try std.testing.expect(!try xml.setCharacterProperties(0, 2, 0, 0, .{ .underline_kind = .bottom }));
    const xml_saved = try xml.save();
    defer a.free(xml_saved);
    try std.testing.expectEqualSlices(u8, hwpx, xml_saved);
    const hwp = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(hwp);
    const binary = try @import("../hwp5/edit/style_preservation.zig").Session.open(a, hwp);
    defer binary.close();
    try std.testing.expectError(error.UnsupportedCharacterUnderlineKind, binary.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .underline_kind = .center } } }));
    const binary_saved = try binary.save(a, .{ .allow_stale_layout = true });
    defer a.free(binary_saved.bytes);
    try std.testing.expectEqualSlices(u8, hwp, binary_saved.bytes);
}
