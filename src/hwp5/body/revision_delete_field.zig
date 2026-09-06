const std = @import("std");
/// Observed deletion-mark spelling only; not a Revision* command wildcard.
pub fn isCommand(command: []const u8) bool {
    return std.mem.eql(u8, command, "$\x00R\x00e\x00v\x00i\x00s\x00i\x00o\x00n\x00D\x00e\x00l\x00e\x00t\x00e\x00;\x00");
}
