const std = @import("std");
const t = std.testing;
const note = @import("note_control.zig");
test "note explicit layouts retain opaque bytes and full width observed fields" {
    var raw = [_]u8{0xff} ** 19;
    const p = try note.Properties.parse(&raw, .observed16);
    const v = p.observed.?;
    try t.expectEqual(0xffffffff, v.number);
    try t.expectEqual(0xffff, v.prefix);
    try t.expectEqual(0xffff, v.suffix);
    try t.expectEqual(0xffffffff, v.number_shape);
    try t.expectEqual(0xffffffff, v.instance_id);
    try t.expectEqualSlices(u8, raw[0..16], p.raw);
    try t.expectEqualSlices(u8, raw[16..], p.extra);
    try t.expect(p.raw.ptr == &raw);
    const specified = try note.Properties.parse(&raw, .spec8);
    try t.expectEqual(null, specified.observed);
    try t.expectEqualSlices(u8, raw[0..8], specified.raw);
    try t.expectEqualSlices(u8, raw[8..], specified.extra);
    for (0..16) |n| try t.expectError(error.UnexpectedEnd, note.Properties.parse(raw[0..n], .observed16));
    for (0..8) |n| try t.expectError(error.UnexpectedEnd, note.Properties.parse(raw[0..n], .spec8));
    @memset(&raw, 0);
    const zero = (try note.Properties.parse(&raw, .observed16)).observed.?;
    try t.expectEqual(0, zero.suffix);
    try t.expectEqual(0, zero.instance_id);
}
test "note IDs distinguish footer and preserve spaces and case" {
    const id = @import("control_rules.zig").id;
    try t.expectEqual(note.Kind.footnote, note.kind(id("fn  ")).?);
    try t.expectEqual(note.Kind.endnote, note.kind(id("en  ")).?);
    inline for (.{ "foot", "FN  ", "EN  ", "fnxx", "enxx" }) |name| try t.expectEqual(null, note.kind(id(name)));
}
