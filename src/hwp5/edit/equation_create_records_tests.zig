const std = @import("std");
const records = @import("equation_create_records.zig");
const a = std.testing.allocator;
fn request() records.Request {
    return .{ .target = .{ .section = 0, .anchor = .{ .host = .{ .original_node = 0 }, .unit = 0 } }, .script = "x+y", .font_size = 1000, .box = .{ .width = 2000, .height = 1000 }, .color_rgb = 0x123456, .baseline = 64, .line_mode = false, .profile = .observed_eq60_hyhwpEQ_zero_word };
}
const expected_equation = [_]u8{
    0,    0, 0,   0, 3,    0,    'x',  0, '+', 0, 'y', 0,
    0xe8, 3, 0,   0, 0x12, 0x34, 0x56, 0, 64,  0, 0,   0,
    19,   0, 'E', 0, 'q',  0,    'u',  0, 'a', 0, 't', 0,
    'i',  0, 'o', 0, 'n',  0,    ' ',  0, 'V', 0, 'e', 0,
    'r',  0, 's', 0, 'i',  0,    'o',  0, 'n', 0, ' ', 0,
    '6',  0, '0', 0, 7,    0,    'H',  0, 'Y', 0, 'h', 0,
    'w',  0, 'p', 0, 'E',  0,    'Q',  0,
};
const expected_anchor = [_]u8{ 11, 0, 'd', 'e', 'q', 'e', 0, 0, 0, 0, 0, 0, 0, 0, 11, 0 };
const expected_common = [_]u8{
    'd',  'e', 'q', 'e', 0x15, 3, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0xd0, 7,   0,   0,   0xe8, 3, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0,
    0,    0,   0,   0,   77,   0, 0,  0, 0, 0, 0, 0, 0, 0,
};
fn verifyFragment(raw: []const u8) !void {
    var it = @import("../record.zig").Iterator.init(raw, .{});
    const control = (try it.next()).?;
    try std.testing.expectEqual(@as(u10, 71), control.tag);
    try std.testing.expectEqual(@as(u10, 1), control.level);
    try std.testing.expectEqualSlices(u8, &expected_common, control.payload);
    const eq = (try it.next()).?;
    try std.testing.expectEqual(@as(u10, 88), eq.tag);
    try std.testing.expectEqual(@as(u10, 2), eq.level);
    try std.testing.expectEqualSlices(u8, &expected_equation, eq.payload);
    try std.testing.expectEqual(null, try it.next());
    const properties = try @import("../body/equation.zig").Properties.parse(eq.payload, .with_font);
    try std.testing.expectEqual(@as(i16, 64), properties.baseline);
    try std.testing.expectEqual(@as(u16, 0), properties.unknown);
    try std.testing.expectEqual(@as(u32, 0x563412), properties.color);
    try std.testing.expectEqual(@as(usize, 0), properties.extra.len);
}
test "HWP5 new equation fragment independent exact bytes explicit dimensions and raw profile" {
    var fragment = try records.create(a, request(), 77, 0, 134);
    defer fragment.deinit();
    try std.testing.expectEqualSlices(u8, &expected_anchor, &fragment.anchor);
    try std.testing.expectEqual(@as(usize, 134), fragment.records.len);
    try verifyFragment(fragment.records);
}
fn section(alloc: std.mem.Allocator) ![]u8 {
    var fragment = try records.create(alloc, request(), 77, 0, 134);
    defer fragment.deinit();
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 9, .little);
    std.mem.writeInt(u32, header[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u32, header[18..22], 1, .little);
    const text = expected_anchor ++ [_]u8{ 13, 0 };
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(alloc);
    const write = @import("../record_writer.zig").append;
    try write(alloc, &out, 66, 0, &header, 1024);
    try write(alloc, &out, 67, 1, &text, 1024);
    try write(alloc, &out, 68, 1, &@as([8]u8, @splat(0)), 1024);
    try out.appendSlice(alloc, fragment.records);
    return out.toOwnedSlice(alloc);
}
fn sourceCase(alloc: std.mem.Allocator) !void {
    const raw = try section(alloc);
    defer alloc.free(raw);
    const before = try alloc.dupe(u8, raw);
    defer alloc.free(before);
    const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
    var document = try @import("../model_projection.zig").fromDecodedSections(alloc, version, &.{raw});
    defer document.deinit(alloc);
    const query = @import("equation_sources.zig");
    const rows = try query.read(alloc, raw, version, .with_font, .{});
    defer alloc.free(rows);
    const sites = try query.sites(alloc, raw, version, document.sections[0].paragraphs, .{});
    defer alloc.free(sites);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(usize, 1), sites.len);
    try std.testing.expectEqual(rows[0].equation_node, sites[0].equation_node);
    try std.testing.expectEqual(@as(usize, 0), sites[0].paragraph_node);
    try std.testing.expectEqual(@as(u32, 0), sites[0].current_unit);
    try std.testing.expectEqualSlices(u8, &.{ 'x', 0, '+', 0, 'y', 0 }, rows[0].script);
    try std.testing.expectEqualSlices(u8, before, raw);
}
test "HWP5 new equation fragment synthetic paragraph counts physical owner source query" {
    try sourceCase(a);
}
fn refusal(req: records.Request, id: u32, level: u10, limit: usize, err: anyerror) !void {
    const result = records.create(a, req, id, level, limit);
    defer {
        if (result) |value| {
            var owned = value;
            owned.deinit();
        } else |_| {}
    }
    try std.testing.expectError(err, result);
}
test "HWP5 new equation fragment invalid explicit values encoding identity and budget refuse" {
    var req = request();
    req.script = "";
    try refusal(req, 77, 0, 1024, error.EmptyEquationScript);
    req = request();
    req.script = &.{ 0xf0, 0x9f, 0x98 };
    try refusal(req, 77, 0, 1024, error.InvalidEquationScriptEncoding);
    req = request();
    req.font_size = 0;
    try refusal(req, 77, 0, 1024, error.InvalidEquationFontSize);
    req = request();
    req.box.height = 0;
    try refusal(req, 77, 0, 1024, error.InvalidEquationBox);
    req = request();
    req.color_rgb = 0x1000000;
    try refusal(req, 77, 0, 1024, error.InvalidCharacterColor);
    req = request();
    req.target.anchor.host = .{ .generated_instance = 0 };
    try refusal(req, 77, 0, 1024, error.SourceBindingMismatch);
    try refusal(request(), 0, 0, 1024, error.InvalidEquationInstanceId);
    try refusal(request(), 77, 1023, 1024, error.LimitExceeded);
    try refusal(request(), 77, 0, 133, error.LimitExceeded);
}
test "HWP5 new equation fragment source query cleanup across all allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(sourceCase, .{});
}
test "HWP5 new equation common header shared serializer retains independent legacy table byte oracle" {
    const common = try @import("../body/object_common_write.zig").write(a, @import("../body/control_rules.zig").table_id, 2000, 1000, 77, .{
        .flags = 0xa0315,
        .offset_y = -100,
        .offset_x = 200,
        .z_order = -3,
        .margins = .{ -1, 2, 0, -2 },
        .prevent_page_break = true,
        .description = "한😀",
    }, 52);
    defer a.free(common);
    const expected = [_]u8{
        ' ',  'l',  'b',  't',  0x15, 3,    10,   0,
        0x9c, 0xff, 0xff, 0xff, 0xc8, 0,    0,    0,
        0xd0, 7,    0,    0,    0xe8, 3,    0,    0,
        0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 2,    0,
        0,    0,    0xfe, 0xff, 77,   0,    0,    0,
        1,    0,    0,    0,    3,    0,    0x5c, 0xd5,
        0x3d, 0xd8, 0,    0xde,
    };
    try std.testing.expectEqualSlices(u8, &expected, common);
}
