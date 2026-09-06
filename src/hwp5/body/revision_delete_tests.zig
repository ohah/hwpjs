const std = @import("std");
const t = std.testing;
const identity = @import("control_identity.zig");
const id = @import("control_rules.zig").id;
test "observed revision deletion requires exact token header code and bounded command" {
    const text = comptime std.unicode.utf8ToUtf16LeStringLiteral("$RevisionDelete;");
    const command = comptime std.mem.sliceAsBytes(text[0..text.len]);
    var b = [_]u8{0} ** (11 + command.len);
    std.mem.writeInt(u16, b[5..7], text.len, .little);
    @memcpy(b[7..][0..command.len], command);
    try t.expectEqual(identity.Identity.observed_revision_delete, try identity.resolve(id("%%*d"), id("%unk"), 3, &b));
    for (0..b.len) |cut| try t.expectError(error.UnexpectedEnd, identity.resolve(id("%%*d"), id("%unk"), 3, b[0..cut]));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%me"), id("%unk"), 3, &b));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%*d"), id("%hlk"), 3, &b));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%*d"), id("%unk"), 2, &b));
    for (7..7 + command.len) |at| {
        b[at] ^= 1;
        try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%*d"), id("%unk"), 3, &b));
        b[at] ^= 1;
    }
}
