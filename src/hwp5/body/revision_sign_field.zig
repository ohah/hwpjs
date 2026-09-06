const std = @import("std");
/// Observed spelling only; no wildcard or numeric argument grammar is inferred.
pub fn isCommand(command: []const u8) bool {
    const text = comptime std.unicode.utf8ToUtf16LeStringLiteral("$RevisionSign;1;");
    return std.mem.eql(u8, command, std.mem.sliceAsBytes(text[0..text.len]));
}
