const std = @import("std");
const t = std.testing;
const p = @import("parser.zig");
const put = @import("../document/test_fixture.zig").put;
fn fixture(duplicate: bool) [124]u8 {
    var b = [_]u8{0} ** 124;
    put(&b, 0, u16, 0xfffe);
    put(&b, 24, u32, 1);
    @memcpy(b[28..44], &@import("header.zig").hwp_fmt);
    put(&b, 44, u32, 48);
    put(&b, 48, u32, 76);
    put(&b, 52, u32, 3);
    put(&b, 56, u32, 2);
    put(&b, 60, u32, 32); // LPSTR before code page
    put(&b, 64, u32, 0);
    put(&b, 68, u32, 44); // dictionary before code page
    put(&b, 72, u32, 1);
    put(&b, 76, u32, 68);
    put(&b, 80, u32, 30);
    put(&b, 84, u32, 2);
    b[88] = 'A';
    put(&b, 92, u32, 2);
    put(&b, 96, u32, 2);
    put(&b, 100, u32, 2);
    b[104] = 'A';
    put(&b, 106, u32, if (duplicate) 2 else 3);
    put(&b, 110, u32, 2);
    b[114] = 'B';
    put(&b, 116, u32, 2);
    put(&b, 120, u16, 65001);
    return b;
}
fn success(a: std.mem.Allocator, bytes: []const u8) !void {
    var doc = try p.Document.parse(a, bytes, 3);
    defer doc.deinit(a);
    try t.expectEqual(65001, doc.code_page.?);
    try t.expectEqual(-535, doc.properties[2].value.i16);
    try t.expectEqualSlices(u8, &.{ 'A', 0 }, doc.properties[0].value.encoded_string.bytes);
    try t.expectEqual(2, doc.dictionary_structure.?.entries);
    var it = try p.dictionary.Iterator.init(doc.properties[1].raw, doc.code_page.?);
    const first = (try it.next()).?;
    const second = (try it.next()).?;
    try t.expectEqual(2, first.id);
    try t.expectEqual(3, second.id);
    try t.expectEqualSlices(u8, &.{ 'A', 0 }, first.name);
    try t.expectEqualSlices(u8, &.{ 'B', 0 }, second.name);
    try t.expect(try it.next() == null);
    try t.expectEqual(1, doc.stats.dictionaries_deferred);
}
fn failure(a: std.mem.Allocator, bytes: []const u8) !void {
    var doc = p.Document.parse(a, bytes, 3) catch |err| switch (err) {
        error.DuplicateDictionaryId => return,
        else => return err,
    };
    defer doc.deinit(a);
    return error.ExpectedDictionaryFailure;
}
test "codepage resolved after dependent values; all dictionary allocation failures unwind" {
    const good = fixture(false);
    try t.checkAllAllocationFailures(t.allocator, success, .{&good});
    const bad = fixture(true);
    try t.checkAllAllocationFailures(t.allocator, failure, .{&bad});
}
test "CodePageString byte counts differ from UnicodeString unit counts" {
    const v = @import("value.zig");
    const raw = [_]u8{ 30, 0, 0, 0, 4, 0, 0, 0, 'A', 0, 0, 0 };
    const wide = try v.parseWithCodePage(2, &raw, 1200);
    try t.expectEqual(4, wide.value.encoded_string.bytes.len);
    const unknown = try v.parseWithCodePage(2, &raw, null);
    try t.expect(unknown.value == .unsupported);
    try t.expectError(error.InvalidSummaryStringSize, v.parseWithCodePage(2, &.{ 30, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0 }, 1200));
    try t.expectError(error.UnexpectedEnd, v.parseWithCodePage(2, &.{ 30, 0, 0, 0, 255, 255, 255, 255 }, 1252));
    try t.expectError(error.UnexpectedEnd, v.parseWithCodePage(2, &.{ 30, 0, 0, 0, 255, 255, 255, 255 }, null));
    const empty = try v.parseWithCodePage(2, &.{ 30, 0, 0, 0, 0, 0, 0, 0 }, 1200);
    try t.expectEqual(0, empty.value.encoded_string.bytes.len);
}
test "dictionary Unicode entry padding and atomic malformed iteration" {
    const d = @import("dictionary.zig");
    const bytes = [_]u8{ 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 'A', 0, 0, 0 };
    var it = try d.Iterator.init(&bytes, 1200);
    const item = (try it.next()).?;
    try t.expectEqual(2, item.id);
    try t.expectEqualSlices(u8, &.{ 'A', 0, 0, 0 }, item.name);
    try t.expect(try it.next() == null);
    const result = try d.inspect(t.allocator, &bytes, 1200);
    try t.expectEqual(1, result.entries);
    var bad = bytes;
    bad[12] = 255;
    bad[14] = 255;
    it = try d.Iterator.init(&bad, 1200);
    for (0..2) |_| {
        try t.expectError(error.InvalidSummaryTerminator, it.next());
        try t.expectEqual(4, it.reader.offset);
        try t.expectEqual(1, it.left);
    }
}
