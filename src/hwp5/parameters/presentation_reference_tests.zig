const std = @import("std");
const t = std.testing;
const Document = @import("parser.zig").Document;
const references = @import("references.zig");
fn check(a: std.mem.Allocator) !void {
    var bytes = [_]u8{
        0x1b, 2,    1,    0,    0,    0,
        0x19, 2,    0,    0x80, 0x19, 2,
        1,    0,    0,    0,    0x66, 2,
        0,    0x80, 0x66, 2,    2,    0,
        0,    0,    1,    0x40, 9,    0,
        4,    0,    0,    0,    0x1e, 0x40,
        2,    0x80, 0,    0,
    };
    var doc = try Document.parse(a, &bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try t.expectEqual(1, try references.validateInContext(doc, 0, .section_control));
    try t.expectError(error.InvalidResourceReference, references.validate(doc, 2));
    try t.expectEqual(0, doc.nodes[doc.nodes.len - 1].value.binary_id);
    try t.expectEqualSlices(u8, &.{ 0, 0 }, bytes[38..40]);
    doc.nodes[3].value.integer = 2; // Active image cannot reuse the gradient absence rule.
    try t.expectError(error.InvalidResourceReference, references.validateInContext(doc, 2, .section_control));
    doc.nodes[4].value.binary_id = 1;
    try t.expectEqual(1, try references.validateInContext(doc, 2, .section_control));
    doc.nodes[4].value.binary_id = 3;
    try t.expectError(error.InvalidResourceReference, references.validateInContext(doc, 2, .section_control));
}
test "presentation inactive gradient reference retains zero and cleans up on allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, check, .{});
}
