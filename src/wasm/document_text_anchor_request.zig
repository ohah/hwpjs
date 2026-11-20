//! Strict read-point schema. It cannot be substituted for selection or mutation requests.
const std = @import("std");
const fields = @import("formatting_patch_request.zig");
const model = @import("../model/document_text_anchor.zig");
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    read_binding: ?@import("../model/document_text_read_binding.zig").Stamp = null,
    value: model.Request,
    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    try @import("text_transaction_request.zig").checkBudget(bytes);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const root = try std.json.parseFromSliceLeaky(std.json.Value, owned, bytes, .{
        .allocate = .alloc_always,
        .duplicate_field_behavior = .@"error",
        .max_value_len = @import("../model/text_transaction.zig").limits.request_bytes,
    });
    try fields.keys(root, &.{ "schemaVersion", "scope", "binding", "readBinding", "target" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    if (!std.mem.eql(u8, try fields.string(try fields.required(root, "scope")), "native-document-text-anchor")) return error.InvalidTextTransactionScope;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), true);
    const target = try fields.required(root, "target");
    const kind = try fields.string(try fields.required(target, "kind"));
    const source: model.Target = if (std.mem.eql(u8, kind, "paragraph")) value: {
        try fields.keys(target, &.{ "kind", "section", "paragraph", "unit", "beforeText" });
        break :value .{ .paragraph = .{ .paragraph = @intCast(try fields.uint(try fields.required(target, "paragraph"), 0xffffffff)) } };
    } else if (std.mem.eql(u8, kind, "created-cell")) value: {
        try fields.keys(target, &.{ "kind", "section", "identity", "row", "column", "unit", "beforeText" });
        const identity = try @import("../model/formatting_binding.zig").decimal(try fields.string(try fields.required(target, "identity")));
        if (identity == 0) return error.InvalidCreatedTableIdentity;
        break :value .{ .created_cell = .{ .identity = identity, .row = @intCast(try fields.uint(try fields.required(target, "row"), 0xffffffff)), .column = @intCast(try fields.uint(try fields.required(target, "column"), 0xffffffff)) } };
    } else return error.InvalidDocumentTextSelectionKind;
    const section: u32 = @intCast(try fields.uint(try fields.required(target, "section"), 0xffffffff));
    const unit: u32 = @intCast(try fields.uint(try fields.required(target, "unit"), 0xffffffff));
    const text = try fields.string(try fields.required(target, "beforeText"));
    if (try @import("../model/independent_text_edits.zig").utf16Units(text) > @import("../model/text_transaction.zig").limits.text_units)
        return error.LimitExceeded;
    var cursor: @import("../text/utf8_utf16_splice.zig").Cursor = .{ .text = text };
    _ = try cursor.seek(unit);
    const read_binding = try @import("document_text_read_stamp.zig").decode(root);
    return .{ .arena = arena, .read_binding = read_binding, .value = .{ .read_stamp = read_binding, .binding = binding, .section = section, .target = source, .unit = unit, .before_text = text } };
}
