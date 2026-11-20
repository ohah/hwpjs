//! Read locators share the existing lifetime issuer, never mutation authority.
const std = @import("std");
const lifetime = @import("formatting_binding.zig");
const Owner = @import("formatting_patch.zig").Owner;

pub fn reference(a: std.mem.Allocator, state: lifetime.State, revision: ?u32, owner: Owner) ![]u8 {
    if (revision == std.math.maxInt(u32)) return error.InvalidDocumentTextRevision;
    const coordinate = try state.reference(a, owner);
    defer a.free(coordinate);
    if (revision) |value| return std.fmt.allocPrint(a, "d1-{s}:r{d}", .{ coordinate, value });
    return std.fmt.allocPrint(a, "d1-{s}:rn", .{coordinate});
}

/// Resolving only recovers a read coordinate. Caller must resolve it against
/// the current complete Native inventory before selection or edit preflight.
pub fn resolve(state: lifetime.State, revision: ?u32, ref: []const u8) !Owner {
    if (!state.opened) return error.EditorNotOpen;
    if (revision == std.math.maxInt(u32)) return error.InvalidDocumentTextRevision;
    if (ref.len > 256 or !std.mem.startsWith(u8, ref, "d1-p")) return error.InvalidDocumentTextReference;
    const marker = std.mem.indexOf(u8, ref, ":r") orelse return error.InvalidDocumentTextReference;
    const owner = state.coordinate(ref[3..marker]) catch return error.StaleDocumentTextReference;
    const raw = ref[marker + 2 ..];
    const observed: ?u32 = if (std.mem.eql(u8, raw, "n")) null else value: {
        const number = lifetime.decimal(raw) catch return error.InvalidDocumentTextReference;
        if (number >= std.math.maxInt(u32)) return error.InvalidDocumentTextRevision;
        break :value @intCast(number);
    };
    if (observed != revision) return error.StaleDocumentTextReference;
    return owner;
}

test "document text search read refs retain lifetime/revision and cannot be used as transaction refs" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try state.open();
    for ([_]?u32{ null, 7 }) |revision| {
        const owner: Owner = .{ .section = 2, .paragraph = 0xfffffffe };
        const ref = try reference(a, state, revision, owner);
        defer a.free(ref);
        try std.testing.expectEqualDeep(owner, try resolve(state, revision, ref));
        try std.testing.expectError(error.StaleDocumentTextReference, resolve(state, 8, ref));
        try std.testing.expectError(error.InvalidTextTransactionReference, @import("text_transaction_binding.zig").resolve(state, 7, ref));
        var other = state;
        try other.open();
        try std.testing.expectError(error.StaleDocumentTextReference, resolve(other, revision, ref));
    }
    try std.testing.expectError(error.InvalidDocumentTextReference, resolve(state, 7, "d1-p1:0:0:r07"));
    try std.testing.expectError(error.InvalidDocumentTextReference, resolve(state, 7, "d1-p1:0:0:r7:extra"));
}
