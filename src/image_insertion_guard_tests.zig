const std = @import("std");
const t = std.testing;
const a = t.allocator;
const insertion = @import("image/image_insertion.zig");
fn request() insertion.Request {
    return .{ .expected_source_sha256 = @splat(0), .target = .{ .section = 0, .paragraph = 0, .unit = 0 }, .expected_text = "", .width = 100, .height = 200 };
}
fn h5(prefix: bool) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], if (prefix) 10 else 2, .little);
    std.mem.writeInt(u32, header[4..8], if (prefix) 1 << 2 else 0, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    const writer = @import("hwp5/record_writer.zig");
    try writer.append(a, &output, 66, 0, &header, 4096);
    const text: [20]u8 = .{ 2, 0, 'd', 'c', 'e', 's', 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 'A', 0, 13, 0 };
    try writer.append(a, &output, 67, 1, if (prefix) &text else text[16..], 4096);
    try writer.append(a, &output, 68, 1, &@as([8]u8, @splat(0)), 4096);
    if (prefix) try writer.append(a, &output, 71, 1, &.{ 'd', 'l', 'o', 'c' }, 4096);
    return output.toOwnedSlice(a);
}
fn refused(expected: anyerror, result: anyerror![]u8) !void {
    if (result) |bytes| {
        a.free(bytes);
        return error.ExpectedGuardRejection;
    } else |err| try t.expectEqual(expected, err);
}

test "image insertion guard H5 secd 토큰과 cold 헤더 불일치 거부" {
    const source = try h5(true);
    defer a.free(source);
    var iterator = @import("hwp5/record.zig").Iterator.init(source, .{});
    _ = try iterator.next();
    const text = (try iterator.next()).?.payload;
    var value = request();
    value.expected_text = try insertion.utf8FromUtf16(a, text);
    defer a.free(value.expected_text);
    value.target.unit = 8;
    try refused(error.ControlIdMismatch, @import("hwp5/edit/image_insertion_section.zig").write(a, source, .{ .raw = 0x05000300 }, value, 1, 1, 4096));
}

test "image insertion guard H5 마지막 CR 뒤 위치는 기존 guard가 거부" {
    const source = try h5(false);
    defer a.free(source);
    var value = request();
    value.expected_text = "A\r";
    value.target.unit = 2;
    try refused(error.InvalidTextPosition, @import("hwp5/edit/image_insertion_section.zig").write(a, source, .{ .raw = 0x05000300 }, value, 1, 1, 4096));
}

test "image insertion guard HX 문단을 가로지르는 필드의 중간 본문 거부" {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='7' type='HYPERLINK'/></p:ctrl><p:t>앞</p:t></p:run></p:p><p:p><p:run><p:t>본문</p:t></p:run></p:p><p:p><p:run><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl><p:t>뒤</p:t></p:run></p:p></s:sec>";
    var tree = try @import("hwpx/section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var value = request();
    value.target.paragraph = 2;
    value.expected_text = "본문";
    var counters: @import("hwpx/section_text.zig").Report = .{};
    const node = (try @import("hwpx/image_insertion_section.zig").locate(a, &tree, value, &counters)).?;
    try refused(error.ProtectedFieldRange, @import("hwpx/image_insertion_section.zig").write(a, &tree, node, value, "<p:pic/>", 4096));
}

test "image insertion guard H5 문단을 가로지르는 필드의 중간 본문 거부" {
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    const writer = @import("hwp5/record_writer.zig");
    for (0..3) |index| {
        var header: [22]u8 = @splat(0);
        std.mem.writeInt(u32, header[0..4], if (index == 1) 2 else 10, .little);
        std.mem.writeInt(u32, header[4..8], if (index == 1) 0 else 1 << 3, .little);
        std.mem.writeInt(u16, header[12..14], 1, .little);
        try writer.append(a, &source, 66, 0, &header, 4096);
        var text: [20]u8 = .{ 3, 0, 'k', 'l', 'h', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 'A', 0, 13, 0 };
        if (index == 2) {
            text[0] = 4;
            text[14] = 4;
        }
        try writer.append(a, &source, 67, 1, if (index == 1) text[16..] else &text, 4096);
        try writer.append(a, &source, 68, 1, &@as([8]u8, @splat(0)), 4096);
        if (index == 0) try writer.append(a, &source, 71, 1, &.{ 'k', 'l', 'h', '%' }, 4096);
    }
    var value = request();
    value.target.paragraph = 1;
    value.expected_text = "A\r";
    try refused(error.ProtectedFieldRange, @import("hwp5/edit/image_insertion_section.zig").write(a, source.items, .{ .raw = 0x05000300 }, value, 1, 1, 4096));
}
