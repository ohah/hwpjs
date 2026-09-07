/// Only changes directly verified in the official LoC change notice.
/// This is not a complete history of ISO 639 or an IANA alias registry.
pub const Entry = struct { code: [2]u8, date: []const u8, preferred: []const u8 };
pub const entries = [_]Entry{
    .{ .code = "bh".*, .date = "2021-05-25", .preferred = "bih" },
    .{ .code = "mo".*, .date = "2008-11-03", .preferred = "ro" },
};
