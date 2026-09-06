const rules = @import("control_rules.zig");
pub const Identity = enum { exact, observed_memo, observed_revision_delete, observed_revision_sign };
/// Observed field representations, not a general unknown-field wildcard.
/// Token/header IDs stay distinct. Command interpretation beyond this marker is deferred.
pub fn resolve(token_id: u32, header_id: u32, code: u16, properties: []const u8) !Identity {
    if (token_id == header_id) return .exact;
    if ((token_id == rules.id("%%me") or token_id == rules.id("%%*d") or token_id == rules.id("%sig")) and header_id == rules.id("%unk") and code == 3) {
        const field = try @import("field_start.zig").Properties.parse(properties);
        if (token_id == rules.id("%%me") and @import("memo_field.zig").isCommand(field.command)) return .observed_memo;
        if (token_id == rules.id("%%*d") and @import("revision_delete_field.zig").isCommand(field.command)) return .observed_revision_delete;
        if (token_id == rules.id("%sig") and @import("revision_sign_field.zig").isCommand(field.command)) return .observed_revision_sign;
    }
    return error.ControlIdMismatch;
}
