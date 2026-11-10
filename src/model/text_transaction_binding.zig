//! Versioned text references share the existing instance lifetime issuer and
//! additionally bind the current history revision. Coordinates are not policy.
const std = @import("std");
const lifetime = @import("formatting_binding.zig");
const Owner = @import("formatting_patch.zig").Owner;
pub const Kind = enum { plain, anchored, field };
pub const Target = struct { owner: Owner, kind: Kind = .plain, begin_element: u32 = 0 };

/// Call only after resolving and authorizing the current Native source owner.
pub fn reference(state: lifetime.State, a: std.mem.Allocator, revision: u32, target: Target) ![]u8 {
    if (revision == std.math.maxInt(u32)) return error.InvalidTextTransactionRevision;
    if (target.kind != .field and target.begin_element != 0) return error.InvalidTextTransactionReference;
    const coordinate = try state.reference(a, target.owner);
    defer a.free(coordinate);
    const kind: u8 = switch (target.kind) {
        .plain => 0,
        .anchored => 1,
        .field => 2,
    };
    return std.fmt.allocPrint(a, "t1-{s}:r{d}:k{d}:b{d}", .{ coordinate, revision, kind, target.begin_element });
}

/// Decoding proves lifetime/revision syntax only. The adapter must resolve the
/// returned owner/kind against live data and independently check source ranges.
pub fn resolve(state: lifetime.State, current_revision: u32, ref: []const u8) !Target {
    if (!state.opened) return error.EditorNotOpen;
    if (current_revision == std.math.maxInt(u32)) return error.InvalidTextTransactionRevision;
    if (ref.len > 256 or !std.mem.startsWith(u8, ref, "t1-p")) return error.InvalidTextTransactionReference;
    const marker = std.mem.indexOf(u8, ref, ":r") orelse return error.InvalidTextTransactionReference;
    const owner = state.coordinate(ref[3..marker]) catch |err| switch (err) {
        error.StaleFormattingBinding => return error.StaleTextTransactionReference,
        error.InvalidFormattingReference => return error.InvalidTextTransactionReference,
        else => return err,
    };
    var pieces = std.mem.splitScalar(u8, ref[marker + 1 ..], ':');
    const revision = try tagged(pieces.next(), 'r', 0xfffffffe);
    const kind = switch (try tagged(pieces.next(), 'k', 2)) {
        0 => Kind.plain,
        1 => Kind.anchored,
        2 => Kind.field,
        else => unreachable,
    };
    const begin: u32 = @intCast(try tagged(pieces.next(), 'b', std.math.maxInt(u32)));
    if (pieces.next() != null or (kind != .field and begin != 0)) return error.InvalidTextTransactionReference;
    if (revision != current_revision) return error.StaleTextTransactionReference;
    return .{ .owner = owner, .kind = kind, .begin_element = begin };
}
fn tagged(optional: ?[]const u8, prefix: u8, max: u64) !u64 {
    const bytes = optional orelse return error.InvalidTextTransactionReference;
    if (bytes.len < 2 or bytes[0] != prefix) return error.InvalidTextTransactionReference;
    const value = lifetime.decimal(bytes[1..]) catch return error.InvalidTextTransactionReference;
    if (value > max) return error.InvalidTextTransactionReference;
    return value;
}

test "independent text reference pins shared lifetime and revision without becoming authority" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try std.testing.expectError(error.EditorNotOpen, reference(state, a, 0, .{ .owner = .{ .section = 0, .paragraph = 2 } }));
    try state.open();
    for ([_]Target{
        .{ .owner = .{ .section = 0, .paragraph = 2 } },
        .{ .owner = .{ .section = 1, .paragraph = 19 }, .kind = .anchored },
        .{ .owner = .{ .section = 2, .paragraph = 4 }, .kind = .field, .begin_element = 37 },
    }) |target| {
        const ref = try reference(state, a, 8, target);
        defer a.free(ref);
        try std.testing.expectEqualDeep(target, try resolve(state, 8, ref));
        try std.testing.expectError(error.StaleTextTransactionReference, resolve(state, 9, ref));
        var reopened = state;
        try reopened.open();
        try std.testing.expectError(error.StaleTextTransactionReference, resolve(reopened, 8, ref));
        reopened.close();
        try std.testing.expectError(error.EditorNotOpen, resolve(reopened, 8, ref));
    }
}

test "independent text reference rejects noncanonical and forged scope data" {
    var state: lifetime.State = .{};
    try state.open();
    const invalid = [_][]const u8{
        "p1:0:2",                      "t2-p1:0:2:r0:k0:b0",  "t1-p01:0:2:r0:k0:b0",
        "t1-p1:0:2:r00:k0:b0",         "t1-p1:0:2:r0:k3:b0",  "t1-p1:0:2:r0:k0:b7",
        "t1-p1:0:2:r0:k0:b0:extra",    "t1-p1:0:2:r0:k0",     "t1-p1:0:2:r4294967295:k0:b0",
        "t1-p1:4294967296:2:r0:k0:b0", "t1-p1:0:2:r0:k2:b-1",
    };
    for (invalid) |ref| try std.testing.expectError(error.InvalidTextTransactionReference, resolve(state, 0, ref));
    try std.testing.expectError(error.InvalidTextTransactionRevision, reference(state, std.testing.allocator, std.math.maxInt(u32), .{ .owner = .{ .section = 0, .paragraph = 0 } }));
}
