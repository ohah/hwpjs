const std = @import("std");
const history = @import("alpha2_history.zig");
pub const Kind = history.Kind;
/// Raw identity, or equality of registered codes after one explicit IANA
/// Preferred-Value step. This is not full language-tag canonicalization.
pub fn matches(kind: Kind, left: [2]u8, right: [2]u8) bool {
    if (std.mem.eql(u8, &left, &right)) return true;
    const l = history.inspect(kind, left);
    const r = history.inspect(kind, right);
    if (!l.registered or !r.registered) return false;
    return std.ascii.eqlIgnoreCase(l.preferred orelse &left, r.preferred orelse &right);
}
