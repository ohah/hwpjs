//! Read-source identity only. This serial is not a History revision or edit ticket.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, format: @import("document.zig").Format, lifetime: @import("formatting_binding.zig").State, serial: u64) ![]u8 {
    if (!lifetime.opened or lifetime.epoch == 0) return error.EditorNotOpen;
    const session = try lifetime.session(a);
    defer a.free(session);
    var epoch_buffer: [20]u8 = undefined;
    var serial_buffer: [20]u8 = undefined;
    const epoch = try std.fmt.bufPrint(&epoch_buffer, "{d}", .{lifetime.epoch});
    const current = try std.fmt.bufPrint(&serial_buffer, "{d}", .{serial});
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = @as(u32, 1),
        .scope = "native-document-text-read-binding",
        .executionAuthority = false,
        .format = @tagName(format),
        .session = session,
        .epoch = epoch,
        .serial = current,
    }, 2048);
}

/// A Native-issued document observation counter, separate from History.
pub const Stamp = struct {
    epoch: u64,
    serial: u64,
    pub fn jsonStringify(self: Stamp, j: *std.json.Stringify) std.json.Stringify.Error!void {
        // maxInt(u64) is 18446744073709551615: every decimal value fits 20 bytes.
        var epoch_buffer: [20]u8 = undefined;
        var serial_buffer: [20]u8 = undefined;
        try j.beginObject();
        try j.objectField("epoch");
        try j.write(std.fmt.bufPrint(&epoch_buffer, "{d}", .{self.epoch}) catch unreachable);
        try j.objectField("serial");
        try j.write(std.fmt.bufPrint(&serial_buffer, "{d}", .{self.serial}) catch unreachable);
        try j.endObject();
    }
};
pub fn assertCurrent(stamp: ?Stamp, state: @import("formatting_binding.zig").State, serial: u64, revision: ?u32) !void {
    if (!state.opened or state.epoch == 0) return error.EditorNotOpen;
    if (stamp) |observed| {
        if (observed.epoch != state.epoch or observed.serial != serial) return error.StaleDocumentTextReadBinding;
    } else if (revision == null) return error.DocumentTextReadBindingRequired;
}
