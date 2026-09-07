const std = @import("std");
const history = @import("history.zig");
const data = @embedFile("alpha2.txt");
pub const provenance_json = @embedFile("source.json");
pub const Status = enum { listed, known_deprecated, not_listed, invalid_syntax };
pub const Report = struct {
    status: Status,
    /// Static upstream preference hint, not automatic replacement or equivalence.
    preferred: ?[]const u8 = null,
    deprecated_on: ?[]const u8 = null,
    history_complete: bool = false,
};
comptime {
    @setEvalBranchQuota(10000);
    if (data.len % 3 != 0) @compileError("invalid ISO alpha-2 table stride");
    for (0..data.len / 3) |i| {
        const code = data[i * 3 ..][0..2];
        if (!std.ascii.isLower(code[0]) or !std.ascii.isLower(code[1]) or data[i * 3 + 2] != '\n') @compileError("invalid ISO alpha-2 table row");
        if (i > 0 and std.mem.order(u8, data[(i - 1) * 3 ..][0..2], code) != .lt) @compileError("unordered or duplicate ISO alpha-2 table row");
    }
}
/// Membership in the pinned LoC alpha-2 table, not historical-document validity.
/// Raw two-byte codes must be lowercase ASCII; no case folding or alias rewrite.
pub fn inspect(code: [2]u8) Report {
    if (!std.ascii.isLower(code[0]) or !std.ascii.isLower(code[1])) return .{ .status = .invalid_syntax };
    var lo: usize = 0;
    var hi: usize = data.len / 3;
    while (lo < hi) {
        const mid = lo + (hi - lo) / 2;
        switch (std.mem.order(u8, &code, data[mid * 3 ..][0..2])) {
            .lt => hi = mid,
            .gt => lo = mid + 1,
            .eq => return .{ .status = .listed },
        }
    }
    for (history.entries) |entry| if (std.mem.eql(u8, &code, &entry.code)) return .{ .status = .known_deprecated, .preferred = entry.preferred, .deprecated_on = entry.date };
    return .{ .status = .not_listed };
}
