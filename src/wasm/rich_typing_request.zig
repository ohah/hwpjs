//! Strict request-lifetime decoder for a single splice's character intent.
const std = @import("std");
const fields = @import("formatting_patch_request.zig");
const formatting = @import("../model/formatting_patch.zig");

pub const max_bytes = formatting.limits.request_bytes;

pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    binding: formatting.Binding,
    patch: formatting.Patch,

    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    try @import("text_transaction_request.zig").checkBudget(bytes);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const root = try std.json.parseFromSliceLeaky(std.json.Value, arena.allocator(), bytes, .{
        .allocate = .alloc_always,
        .max_value_len = max_bytes,
        .duplicate_field_behavior = .@"error",
    });
    try fields.keys(root, &.{ "schemaVersion", "binding", "insertion" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), false);
    const patch = try fields.decodeCharacterInsertion(try fields.required(root, "insertion"));
    if (!patch.hasCharacter()) return error.UnsupportedTextInsertionFormatting;
    return .{ .arena = arena, .binding = binding, .patch = patch };
}
