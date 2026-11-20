const std = @import("std");
const domain = @import("document_text_read_domain.zig");
const issuer: @import("formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
test "document text readonly H5 domain separates coexisting editor and viewer at equal epoch and generation" {
    const a = std.testing.allocator;
    const point: @import("formatting_patch.zig").Owner = .{ .section = 0, .paragraph = 0 };
    const editor = try domain.reference(a, issuer, null, point, 13, .editor);
    defer a.free(editor);
    const viewer = try domain.reference(a, issuer, null, point, 13, .readonly_hwp5);
    defer a.free(viewer);
    try std.testing.expect(!std.mem.eql(u8, editor, viewer));
    try std.testing.expectEqualDeep(point, try domain.resolve(issuer, null, 13, editor, .editor));
    try std.testing.expectEqualDeep(point, try domain.resolve(issuer, null, 13, viewer, .readonly_hwp5));
    try std.testing.expectError(error.InvalidDocumentTextReference, domain.resolve(issuer, null, 13, viewer, .editor));
    try std.testing.expectError(error.InvalidDocumentTextReference, domain.resolve(issuer, null, 13, editor, .readonly_hwp5));
}
test "document text readonly H5 domain issues no History binding and cannot retag a prior epoch or generation" {
    const a = std.testing.allocator;
    const session = try domain.session(a, issuer, .readonly_hwp5);
    defer a.free(session);
    try std.testing.expectEqualStrings("v-s7", session);
    const ref = try domain.reference(a, issuer, null, .{ .section = 0, .paragraph = 0 }, 13, .readonly_hwp5);
    defer a.free(ref);
    try std.testing.expectError(error.InvalidDocumentTextRevision, domain.reference(a, issuer, 1, .{ .section = 0, .paragraph = 0 }, 13, .readonly_hwp5));
    try std.testing.expectError(error.StaleDocumentTextReadBinding, domain.resolve(issuer, null, 14, ref, .readonly_hwp5));
    try std.testing.expectError(error.StaleDocumentTextReference, domain.resolve(.{ .epoch = 8, .opened = true }, null, 13, ref, .readonly_hwp5));
}
