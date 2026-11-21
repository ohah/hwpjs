//! Optional script-only transport. Hashes, native owners and tickets stay Native.
const std = @import("std");
pub const schema_version: u32 = 1;
pub const max_request_bytes = 1024 * 1024;
pub const max_reply_bytes = 2 * 1024 * 1024;
pub const max_script_units = 65535;
pub const max_script_bytes = @import("../hwp5/edit/equation_create_request.zig").max_script_bytes;
pub const Commit = struct { schemaVersion: u32, lease: []const u8, script: []const u8 };
pub fn leaseId(text: []const u8) !u64 {
    const value = try @import("../model/formatting_binding.zig").decimal(text);
    if (value == 0) return error.InvalidEquationScriptLease;
    return value;
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Commit) {
    if (bytes.len == 0 or bytes.len > max_request_bytes) return error.LimitExceeded;
    const parsed = try std.json.parseFromSlice(Commit, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer parsed.deinit();
    if (parsed.value.schemaVersion != schema_version) return error.UnsupportedEquationScriptEditWire;
    _ = try leaseId(parsed.value.lease);
    const script = parsed.value.script;
    if (script.len == 0) return error.EmptyEquationScript;
    if (script.len > max_script_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(script)) return error.InvalidEquationScriptEncoding;
    if ((std.unicode.calcUtf16LeLen(script) catch return error.InvalidEquationScriptEncoding) > max_script_units) return error.LimitExceeded;
    return parsed;
}
pub fn capture(a: std.mem.Allocator, id: u64, section: u32, node: u32, layout: @import("../hwp5/body/equation.zig").Layout, revision: u32, script: []const u16) ![]u8 {
    if (script.len > max_script_units) return error.LimitExceeded;
    if (id == 0) return error.InvalidEquationScriptLease;
    if (revision == std.math.maxInt(u32)) return error.HistoryRevisionExhausted;
    var buffer: [20]u8 = undefined;
    const token = try std.fmt.bufPrint(&buffer, "{d}", .{id});
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = schema_version,
        .scope = "hwp5-equation-script-edit-capture",
        .executionAuthority = false,
        .lease = token,
        .section = section,
        .equationNode = node,
        .layout = if (layout == .version_only) "version-only" else "with-font",
        .historyRevision = revision,
        .scriptUtf16LE = script,
        .limits = .{ .scriptUnits = max_script_units, .scriptBytes = max_script_bytes, .requestBytes = max_request_bytes, .replyBytes = max_reply_bytes },
    }, max_reply_bytes);
}
