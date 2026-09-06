const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const strings = @import("../utf16_string.zig");
const xml = @import("template.zig");
const String = @import("string.zig").String;
test "counted UTF16 readers are atomic for both count widths and invalid cursor" {
    inline for (.{ strings.read, strings.read32 }) |read| {
        const raw = [_]u8{ 0xff, 0xff, 0xff, 0xff, 1 };
        var r: Reader = .{ .bytes = &raw };
        try t.expectError(error.UnexpectedEnd, read(&r));
        try t.expectEqual(0, r.offset);
        r.offset = raw.len + 1;
        try t.expectError(error.UnexpectedEnd, read(&r));
        try t.expectEqual(raw.len + 1, r.offset);
    }
}
test "XMLTemplate preserves raw units and unknown tails without XML normalization" {
    const raw = [_]u8{ 3, 0, 0, 0, 0, 0xd8, 0, 0, 0xff, 0xfe, 0x55 };
    const s = try String.parse(&raw);
    try t.expectEqualSlices(u8, raw[4..10], s.value);
    try t.expectEqualSlices(u8, raw[10..], s.extra);
    try t.expect(s.value.ptr == raw[4..].ptr);
    for (0..10) |i| try t.expectError(error.UnexpectedEnd, String.parse(raw[0..i]));
}
test "XMLTemplate absent, empty, truncated and aggregate budget are distinct" {
    const absent = try xml.Template.parse(.{}, 0);
    try t.expect(absent.schema_name == null);
    try t.expectEqual(0, absent.total_bytes);
    const empty = [_]u8{0} ** 4;
    const raw = [_]u8{ 1, 0, 0, 0, 'x', 0, 1 };
    const input: xml.Input = .{ .schema_name = &empty, .schema = &raw };
    const parsed = try xml.Template.parse(input, 11);
    try t.expectEqual(0, parsed.schema_name.?.value.len);
    try t.expect(parsed.instance == null);
    try t.expectEqual(11, parsed.total_bytes);
    try t.expectEqual(1, parsed.trailing_bytes);
    try t.expectError(error.LimitExceeded, xml.Template.parse(input, 10));
    inline for (.{ "schema_name", "schema", "instance" }) |field| {
        var bad: xml.Input = .{};
        @field(bad, field) = &.{};
        try t.expectError(error.UnexpectedEnd, xml.Template.parse(bad, 0));
    }
}
