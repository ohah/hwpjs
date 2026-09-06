const std = @import("std");
const t = std.testing;
const identity = @import("control_identity.zig");
const id = @import("control_rules.zig").id;
test "observed revision sign requires exact bounded command and preserves other identities" {
    const text = comptime std.unicode.utf8ToUtf16LeStringLiteral("$RevisionSign;1;");
    const command = comptime std.mem.sliceAsBytes(text[0..text.len]);
    var b = [_]u8{0} ** (11 + command.len);
    std.mem.writeInt(u16, b[5..7], text.len, .little);
    @memcpy(b[7..][0..command.len], command);
    try t.expectEqual(identity.Identity.observed_revision_sign, try identity.resolve(id("%sig"), id("%unk"), 3, &b));
    for (0..b.len) |cut| try t.expectError(error.UnexpectedEnd, identity.resolve(id("%sig"), id("%unk"), 3, b[0..cut]));
    for ([_]u32{ id("%%me"), id("%%*d"), id("%hlk") }) |other| try t.expectError(error.ControlIdMismatch, identity.resolve(other, id("%unk"), 3, &b));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%sig"), id("%hlk"), 3, &b));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%sig"), id("%unk"), 2, &b));
    for (7..7 + command.len) |at| {
        b[at] ^= 1;
        try t.expectError(error.ControlIdMismatch, identity.resolve(id("%sig"), id("%unk"), 3, &b));
        b[at] ^= 1;
    }
    try t.expectEqual(identity.Identity.exact, try identity.resolve(id("%sig"), id("%sig"), 3, &.{}));
    var with_tail = b ++ [_]u8{ 255, 17, 0 };
    try t.expectEqual(identity.Identity.observed_revision_sign, try identity.resolve(id("%sig"), id("%unk"), 3, &with_tail));
}
