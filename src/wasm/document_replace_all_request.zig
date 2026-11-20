//! Bounded literal intent only. Native inventory and policy own all targets.
const std = @import("std");
const fields = @import("formatting_patch_request.zig");
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    value: @import("../model/document_replace_all.zig").Request,
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
    try fields.keys(root, &.{ "schemaVersion", "scope", "binding", "query", "replacement" });
    if (try fields.uint(try fields.required(root, "schemaVersion"), 0xffffffff) != 1) return error.InvalidTextTransactionSchema;
    if (!std.mem.eql(u8, try fields.string(try fields.required(root, "scope")), "native-document-text")) return error.InvalidTextTransactionScope;
    const binding = try fields.decodeBinding(try fields.required(root, "binding"), false);
    const query = try fields.string(try fields.required(root, "query"));
    const replacement = try fields.string(try fields.required(root, "replacement"));
    const query_units = try @import("../model/independent_text_edits.zig").utf16Units(query);
    if (query_units == 0) return error.InvalidSearchQuery;
    if (query_units > 200000 or replacement.len > @import("../model/text_transaction.zig").limits.inserted_bytes) return error.LimitExceeded;
    _ = try @import("../model/independent_text_edits.zig").utf16Units(replacement);
    return .{ .arena = arena, .value = .{ .binding = binding, .query = query, .replacement = replacement } };
}

const example = "{\"schemaVersion\":1,\"scope\":\"native-document-text\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"query\":\"needle\",\"replacement\":\"한\"}";
fn ownedDecode(a: std.mem.Allocator) !void {
    const input = try a.dupe(u8, example);
    defer a.free(input);
    var request = try decode(a, input);
    defer request.deinit();
    @memset(input, ' ');
    try std.testing.expectEqualStrings("needle", request.value.query);
    try std.testing.expectEqualStrings("한", request.value.replacement);
    try std.testing.expectEqualStrings("s1", request.value.binding.session);
}
test "document text Native request owns literal intent with allocation cleanup" {
    try ownedDecode(std.testing.allocator);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, ownedDecode, .{});
}
test "document text Native request rejects target subsets empty query duplicate keys and null revision" {
    const a = std.testing.allocator;
    const invalid = [_][]const u8{
        "{\"schemaVersion\":1,\"scope\":\"native-document-text\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"query\":\"needle\",\"replacement\":\"X\",\"groups\":[]}",
        "{\"schemaVersion\":1,\"scope\":\"selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"query\":\"needle\",\"replacement\":\"X\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text\",\"binding\":{\"session\":\"s1\",\"revision\":null},\"query\":\"needle\",\"replacement\":\"X\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"query\":\"\",\"replacement\":\"X\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"query\":\"needle\",\"query\":\"other\",\"replacement\":\"X\"}",
    };
    for (invalid) |bytes| {
        var value = decode(a, bytes) catch continue;
        value.deinit();
        return error.ExpectedRequestRejection;
    }
}
