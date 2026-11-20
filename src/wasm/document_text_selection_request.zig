//! Bounded read selector only. Null revision is permitted for a read-only view;
//! this schema is distinct from every text mutation request.
const std = @import("std");
const fields = @import("formatting_patch_request.zig");
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    read_binding: ?@import("../model/document_text_read_binding.zig").Stamp = null,
    value: @import("../model/document_text_selection.zig").Request,
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
    try fields.keys(root, &.{ "schemaVersion", "scope", "binding", "readBinding", "ref", "startUnit", "endUnit", "expectedOriginal" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    if (!std.mem.eql(u8, try fields.string(try fields.required(root, "scope")), "native-document-text-selection")) return error.InvalidTextTransactionScope;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), true);
    const ref = try fields.string(try fields.required(root, "ref"));
    if (ref.len == 0 or ref.len > 256) return error.InvalidDocumentTextReference;
    const start: u32 = @intCast(try fields.uint(try fields.required(root, "startUnit"), 0xffffffff));
    const end: u32 = @intCast(try fields.uint(try fields.required(root, "endUnit"), 0xffffffff));
    if (start >= end) return error.InvalidDocumentTextMatch;
    const expected = try fields.string(try fields.required(root, "expectedOriginal"));
    const units = try @import("../model/independent_text_edits.zig").utf16Units(expected);
    if (units == 0 or units > 200000) return error.LimitExceeded;
    if (units != end - start) return error.ExpectedTextLengthMismatch;
    const read_binding = try @import("document_text_read_stamp.zig").decode(root);
    return .{ .arena = arena, .read_binding = read_binding, .value = .{ .read_stamp = read_binding, .binding = binding, .ref = ref, .start = start, .end = end, .expected = expected } };
}
