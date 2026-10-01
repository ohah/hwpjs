const std = @import("std");
const records = @import("../record_writer.zig");
const Iterator = @import("../record.zig").Iterator;
const projection = @import("../model_projection.zig");
const write = @import("text_section_writer.zig").write;
const a = std.testing.allocator;

test "section writer resumes parent metadata after a nested control paragraph" {
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var header = [_]u8{0} ** 24;
    std.mem.writeInt(u32, header[0..4], 1, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    var run = [_]u8{0} ** 8;
    try records.append(a, &input, 66, 0, &header, 4096);
    try records.append(a, &input, 71, 1, &.{ ' ', 'o', 's', 'g' }, 4096);
    try records.append(a, &input, 66, 2, &header, 4096);
    try records.append(a, &input, 67, 3, &.{ 13, 0 }, 4096);
    try records.append(a, &input, 68, 3, &run, 4096);
    try records.append(a, &input, 67, 1, &.{ 13, 0 }, 4096);
    try records.append(a, &input, 68, 1, &run, 4096);
    const version = @import("../version.zig").Version{ .raw = 0x05000302 };
    var document = try projection.fromDecodedSections(a, version, &.{input.items});
    defer document.deinit(a);
    const parent = &document.sections[0].paragraphs[0];
    parent.range_tags = try a.alloc(@import("../../model/document.zig").TextRange, 0);
    parent.character_runs[0].char_shape_id = 7;
    const output = try write(a, input.items, document.sections[0], version, 4096);
    defer a.free(output);
    var before = Iterator.init(input.items, .{});
    var after = Iterator.init(output, .{});
    while (try before.next()) |record| {
        const saved = (try after.next()).?;
        if (record.tag == 68 and record.level == 1) {
            try std.testing.expectEqual(@as(u32, 7), std.mem.readInt(u32, saved.payload[4..8], .little));
        } else try std.testing.expectEqualSlices(u8, record.raw, saved.raw);
    }
    try std.testing.expect(try after.next() == null);
}
