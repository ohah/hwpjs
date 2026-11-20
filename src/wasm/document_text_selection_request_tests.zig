const std = @import("std");
const decoder = @import("document_text_selection_request.zig");
const example = "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":null},\"ref\":\"d1:opaque\",\"startUnit\":1,\"endUnit\":3,\"expectedOriginal\":\"😀\"}";
fn ownedDecode(a: std.mem.Allocator) !void {
    const input = try a.dupe(u8, example);
    defer a.free(input);
    var request = try decoder.decode(a, input);
    defer request.deinit();
    @memset(input, ' ');
    try std.testing.expectEqualStrings("s1", request.value.binding.session);
    try std.testing.expectEqualStrings("d1:opaque", request.value.ref);
    try std.testing.expectEqualStrings("😀", request.value.expected);
    try std.testing.expectEqual(@as(?u32, null), request.value.binding.revision);
}
test "document text selection request owns readonly null revision through all allocation failures" {
    try ownedDecode(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(ownedDecode, .{});
}
test "document text selection request rejects duplicate and injected target authority" {
    const invalid = [_][]const u8{
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"ref\":\"d1:b\",\"startUnit\":1,\"endUnit\":3,\"expectedOriginal\":\"😀\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"startUnit\":1,\"endUnit\":3,\"expectedOriginal\":\"😀\",\"target\":{\"paragraph\":1}}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"startUnit\":1,\"endUnit\":3,\"expectedOriginal\":\"😀\",\"executionAuthority\":true}",
    };
    for (invalid) |bytes| {
        var value = decoder.decode(std.testing.allocator, bytes) catch continue;
        value.deinit();
        return error.ExpectedRequestRejection;
    }
}
test "document text selection request refuses reversed sparse and mismatched endpoints" {
    const invalid = [_][]const u8{
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"startUnit\":3,\"endUnit\":1,\"expectedOriginal\":\"😀\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"startUnit\":0,\"endUnit\":4294967296,\"expectedOriginal\":\"😀\"}",
        "{\"schemaVersion\":1,\"scope\":\"native-document-text-selection\",\"binding\":{\"session\":\"s1\",\"revision\":7},\"ref\":\"d1:a\",\"startUnit\":1,\"endUnit\":2,\"expectedOriginal\":\"😀\"}",
    };
    for (invalid) |bytes| {
        var value = decoder.decode(std.testing.allocator, bytes) catch continue;
        value.deinit();
        return error.ExpectedRequestRejection;
    }
}
