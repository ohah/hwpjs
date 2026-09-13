const std = @import("std");
const t = std.testing;
const objects = @import("objects.zig");
const records = @import("records.zig");
const header_types = @import("header.zig");

fn header(slots: u16) header_types.Header {
    return .{
        .placeable = undefined,
        .meta = .{ .metafile_type = .memory, .version = .version_300, .size_words = 0, .number_of_objects = slots, .max_record_words = 0, .number_of_members = 0 },
        .records_offset = 0,
    };
}

fn framing(bytes: []const u8) records.Summary {
    return .{ .count = 0, .max_record_words = 0, .eof_end = bytes.len, .trailing_zero_words = 0 };
}

const create = [_]u8{ 3, 0, 0, 0, 0xfa, 2 };
fn reference(function: u16, index: u16) [8]u8 {
    var bytes = [_]u8{0} ** 8;
    std.mem.writeInt(u32, bytes[0..4], 4, .little);
    std.mem.writeInt(u16, bytes[4..6], function, .little);
    std.mem.writeInt(u16, bytes[6..8], index, .little);
    return bytes;
}

test "WMF object table assigns, references, deletes and reuses slots" {
    const bytes = create ++ create ++ reference(0x012d, 1) ++ reference(0x01f0, 0) ++ create ++ reference(0x012d, 0);
    const report = try objects.validate(t.allocator, &bytes, header(2), framing(&bytes));
    try t.expectEqual(@as(usize, 3), report.creates);
    try t.expectEqual(@as(usize, 2), report.selects);
    try t.expectEqual(@as(usize, 1), report.deletes);
    try t.expectEqual(@as(usize, 2), report.peak_live);
    try t.expectEqual(@as(usize, 2), report.final_live);
}

test "WMF object table rejects overflow and dead references" {
    const overflow = create ++ create;
    try t.expectError(error.WmfObjectTableFull, objects.validate(t.allocator, &overflow, header(1), framing(&overflow)));
    const select_dead = reference(0x012d, 0);
    try t.expectError(error.InvalidWmfObjectReference, objects.validate(t.allocator, &select_dead, header(1), framing(&select_dead)));
    const delete_dead = reference(0x01f0, 0);
    try t.expectError(error.InvalidWmfObjectDelete, objects.validate(t.allocator, &delete_dead, header(1), framing(&delete_dead)));
}

test "WMF object references require their exact four-WORD shape" {
    const short_select = [_]u8{ 3, 0, 0, 0, 0x2d, 1 };
    try t.expectError(error.InvalidWmfObjectRecordSize, objects.validate(t.allocator, &short_select, header(1), framing(&short_select)));
    const long_delete = [_]u8{ 5, 0, 0, 0, 0xf0, 1, 0, 0, 0, 0 };
    try t.expectError(error.InvalidWmfObjectRecordSize, objects.validate(t.allocator, &long_delete, header(1), framing(&long_delete)));
}
