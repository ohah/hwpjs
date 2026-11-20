const std = @import("std");
const decoder = @import("document_text_anchor_request.zig");
const input = "{\"schemaVersion\":1,\"scope\":\"native-document-text-anchor\",\"binding\":{\"session\":\"s7\",\"revision\":null},\"readBinding\":{\"epoch\":\"7\",\"serial\":\"9007199254740993\"},\"target\":{\"kind\":\"created-cell\",\"section\":0,\"identity\":\"18446744073709551615\",\"row\":17,\"column\":31,\"unit\":0,\"beforeText\":\"cell\"}}";
fn ownershipCase(a: std.mem.Allocator) !void {
    var value = try decoder.decode(a, input);
    defer value.deinit();
    try std.testing.expectEqual(@as(u64, 9007199254740993), value.read_binding.?.serial);
    try std.testing.expectEqual(std.math.maxInt(u64), value.value.target.created_cell.identity);
    try std.testing.expectEqualStrings("s7", value.value.binding.session);
    try std.testing.expect(value.value.binding.revision == null);
}
test "document text anchor request owns typed sparse identity and Native read counter through OOM" {
    try @import("../testing/allocation_failures.zig").check(ownershipCase, .{});
}
test "document text anchor request rejects duplicate or invented read counter authority" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-anchor\",\"scope\":\"native-document-text-anchor\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-anchor\",\"binding\":{\"session\":\"s7\",\"revision\":null},\"executionAuthority\":true}",
    }) |bytes| {
        if (decoder.decode(a, bytes)) |owned| {
            var value = owned;
            value.deinit();
            return error.TestUnexpectedResult;
        } else |_| {}
    }
    for ([_][]const u8{
        "{\"readBinding\":{\"epoch\":\"0\",\"serial\":\"1\"}}",
        "{\"readBinding\":{\"epoch\":\"7\",\"serial\":\"18446744073709551616\"}}",
        "{\"readBinding\":{\"epoch\":\"7\",\"serial\":\"1\",\"revision\":0}}",
    }) |bytes| {
        var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
        defer parsed.deinit();
        try std.testing.expectError(if (std.mem.indexOf(u8, bytes, "revision") != null) error.UnknownFormattingField else if (std.mem.indexOf(u8, bytes, "184467") != null) error.InvalidFormattingReference else error.InvalidDocumentTextReadBinding, @import("document_text_read_stamp.zig").decode(parsed.value));
    }
}
