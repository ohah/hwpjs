const std = @import("std");
const State = @import("document_text_read_generation.zig").State;
test "document text read generation starts at Native zero without a History revision" {
    var authority: State = .{};
    try std.testing.expectEqual(@as(u64, 0), try authority.current());
    try authority.assertCurrent(0);
    try authority.enterMutation();
    try std.testing.expectEqual(@as(u64, 1), try authority.current());
    try std.testing.expectError(error.StaleDocumentTextReadBinding, authority.assertCurrent(0));
}
test "document text read generation is not rolled back with checkpoint bytes or identical final text" {
    var authority: State = .{};
    var restorable_document: u32 = 7;
    const checkpoint = restorable_document;
    const captured = try authority.current();
    try authority.enterMutation();
    restorable_document = 8;
    restorable_document = checkpoint;
    try std.testing.expectEqual(@as(u32, 7), restorable_document);
    try std.testing.expectError(error.StaleDocumentTextReadBinding, authority.assertCurrent(captured));
    const before_undo = try authority.current();
    try authority.enterMutation();
    try authority.enterMutation();
    try std.testing.expectError(error.StaleDocumentTextReadBinding, authority.assertCurrent(before_undo));
}
fn failAfterEntry(authority: *State) !void {
    try authority.enterMutation();
    return error.ControlledMutationFailure;
}
test "document text read generation consumes admission even when a later operation fails" {
    var authority: State = .{};
    const captured = try authority.current();
    try std.testing.expectError(error.ControlledMutationFailure, failAfterEntry(&authority));
    // No success/failure completion API can rewind the issued observation generation.
    try std.testing.expectError(error.StaleDocumentTextReadBinding, authority.assertCurrent(captured));
}
test "document text read generation maximum never wraps or revalidates previous reads" {
    var authority: State = .{ .value = std.math.maxInt(u64) - 1 };
    try authority.enterMutation();
    try std.testing.expectEqual(std.math.maxInt(u64), try authority.current());
    try std.testing.expectError(error.DocumentTextReadGenerationExhausted, authority.enterMutation());
    authority.invalidate();
    try std.testing.expectEqual(std.math.maxInt(u64), authority.value);
    try std.testing.expectError(error.DocumentTextReadGenerationExhausted, authority.current());
    try std.testing.expectError(error.DocumentTextReadGenerationExhausted, authority.assertCurrent(std.math.maxInt(u64)));
    // Exercise the actual JSON hook at both decimal-string boundaries.
    const Stamp = @import("document_text_read_binding.zig").Stamp;
    const a = std.testing.allocator;
    const maximum = Stamp{ .epoch = std.math.maxInt(u64), .serial = std.math.maxInt(u64) };
    const encoded_maximum = try std.json.Stringify.valueAlloc(a, maximum, .{});
    defer a.free(encoded_maximum);
    try std.testing.expectEqualStrings("{\"epoch\":\"18446744073709551615\",\"serial\":\"18446744073709551615\"}", encoded_maximum);
    const encoded_zero = try std.json.Stringify.valueAlloc(a, Stamp{ .epoch = 0, .serial = 0 }, .{});
    defer a.free(encoded_zero);
    try std.testing.expectEqualStrings("{\"epoch\":\"0\",\"serial\":\"0\"}", encoded_zero);
    var tiny_buffer: [1]u8 = undefined;
    var tiny_writer: std.Io.Writer = .fixed(&tiny_buffer);
    try std.testing.expectError(error.WriteFailed, std.json.Stringify.value(maximum, .{}, &tiny_writer));
}
