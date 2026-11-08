const std = @import("std");
const t = std.testing;
const records = @import("image_insertion_records.zig");

test "image insertion H5 인라인 생성 payload를 기존 Native parser로 읽음" {
    const value = try records.create(.{ .width = 2835, .height = 1417 }, 5, 1234);
    const header = try @import("../body/control_header.zig").Header.parse(&value.control);
    try t.expectEqual(@as(u32, 0x67736f20), header.id);
    const common = try @import("../body/object_common.zig").parseControl(header);
    try t.expectEqual(@as(u32, 2835), common.width);
    try t.expectEqual(@as(u32, 1417), common.height);
    try t.expectEqual(@as(u32, 1234), common.instance_id);
    try t.expect(common.flags & 1 != 0);
    try t.expect(@import("../body/object_common.zig").hasAbsoluteDimensions(common.flags));
    const component = try @import("../body/shape_component.zig").Component.parse(&value.component, .double_id);
    try t.expectEqual(@as(u32, 0x24706963), component.id);
    try t.expectEqual(@as(?u32, 0x24706963), component.second_id);
    try t.expectEqual(@as(usize, 1), component.rendering.pairs.count());
    try t.expectEqual(@as(u32, 2835), component.current_width);
    const picture = try @import("../body/shape_picture.zig").Picture.parse(&value.picture, .interleaved, .with_instance78);
    try t.expectEqual(@as(u16, 5), picture.image.bin_data_id);
    try t.expectEqual(@as(?u32, 1234), picture.instance_id);
    try t.expectEqualDeep([4]i32{ 0, 0, 2835, 1417 }, picture.crop);
    try t.expectEqualDeep([2]i32{ 2835, 1417 }, .{ picture.points.get(2).?.x, picture.points.get(2).?.y });
    try t.expectEqualSlices(u8, &.{ 11, 0, 32, 111, 115, 103, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0 }, &value.text_control);
}

test "image insertion H5 레코드 순서·계층과 명시 한도" {
    const a = t.allocator;
    const value = try records.create(.{ .width = 100, .height = 200 }, 1, 1);
    const bytes = try records.encode(a, &value, 0, 4096);
    defer a.free(bytes);
    var iterator = @import("../record.zig").Iterator.init(bytes, .{});
    for ([_]u10{ 71, 76, 85 }, [_]u10{ 1, 2, 3 }) |tag, level| {
        const row = (try iterator.next()).?;
        try t.expectEqual(tag, row.tag);
        try t.expectEqual(level, row.level);
    }
    try t.expect((try iterator.next()) == null);
    try t.expectError(error.LimitExceeded, records.encode(a, &value, 1021, 4096));
    try t.expectError(error.LimitExceeded, records.encode(a, &value, 0, 1));
    try t.expectError(error.InvalidPictureInsertionIdentity, records.create(.{ .width = 1, .height = 1 }, 0, 1));
    try t.expectError(error.InvalidPictureInsertionSize, records.create(.{ .width = 0, .height = 1 }, 1, 1));
}

fn allocationCase(a: std.mem.Allocator) !void {
    const value = try records.create(.{ .width = 100, .height = 200 }, 1, 1);
    const bytes = try records.encode(a, &value, 0, 4096);
    defer a.free(bytes);
}
test "image insertion H5 생성기 모든 할당 실패 소유권" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}

test "image insertion H5 생성 그림을 기존 Native picture inventory로 읽음" {
    const a = t.allocator;
    const value = try records.create(.{ .width = 100, .height = 200 }, 1, 99);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 0x80000009, .little);
    std.mem.writeInt(u32, header[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    var text: [18]u8 = undefined;
    @memcpy(text[0..16], &value.text_control);
    std.mem.writeInt(u16, text[16..18], 13, .little);
    const writer = @import("../record_writer.zig");
    try writer.append(a, &section, 66, 0, &header, 4096);
    try writer.append(a, &section, 67, 1, &text, 4096);
    try writer.append(a, &section, 68, 1, &@as([8]u8, @splat(0)), 4096);
    const generated = try records.encode(a, &value, 0, 4096);
    defer a.free(generated);
    try section.appendSlice(a, generated);
    const pictures = try @import("picture_sources.zig").read(a, section.items, .{ .raw = 0x05000300 }, .with_instance78);
    defer a.free(pictures);
    try t.expectEqual(@as(usize, 1), pictures.len);
    try t.expectEqual(@as(u16, 1), pictures[0].bin_data_id);
    try t.expectEqual(@as(?u32, 99), pictures[0].instance_id);
}
