const std = @import("std");
const rules = @import("control_rules.zig");
pub const Identity = enum { exact, observed_memo };
/// Observed MEMO representation, not a general unknown-field wildcard.
/// Token/header IDs stay distinct. Command interpretation beyond this marker is deferred.
pub fn resolve(token_id: u32, header_id: u32, code: u16, properties: []const u8) !Identity {
    if (token_id == header_id) return .exact;
    if (token_id == rules.id("%%me") and header_id == rules.id("%unk") and code == 3) {
        const field = try @import("field_start.zig").Properties.parse(properties);
        if (std.mem.startsWith(u8, field.command, "M\x00E\x00M\x00O\x00/\x00")) return .observed_memo;
    }
    return error.ControlIdMismatch;
}
