const std = @import("std");
const Owner = @import("document_text_read_owner.zig").Owner;
const Binding = @import("../model/formatting_binding.zig").State;
const Stamp = @import("../model/document_text_read_binding.zig").Stamp;
const issuer: Binding = .{ .epoch = 7, .opened = true };
const current: Stamp = .{ .epoch = 7, .serial = 13 };
fn fixture(a: std.mem.Allocator) ![]u8 {
    const f = @import("document/test_fixture.zig");
    var header = f.header();
    f.put(&header, 36, u32, @as(u32, 1) << @backingInt(@import("file_header.zig").Flag.digital_signature));
    const info = try f.docInfo(a, 1);
    defer a.free(info);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    var paragraph = @as([24]u8, @splat(0));
    f.put(&paragraph, 0, u32, 4);
    try f.frame(a, &section, 66, 0, &paragraph);
    var text: [8]u8 = undefined;
    f.put(&text, 0, u16, 0xac00);
    f.put(&text, 2, u16, 0xb098);
    f.put(&text, 4, u16, 0xb2e4);
    f.put(&text, 6, u16, 13);
    try f.frame(a, &section, 67, 1, &text);
    return @import("../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = info },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = section.items },
    }, .{});
}
test "document text readonly H5 owner keeps signed source text and null History revision" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    var snapshot = try owner.snapshot(a, issuer, current);
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(?u32, null), snapshot.binding.revision);
    try std.testing.expectEqual(@as(usize, 1), snapshot.rows.items.len);
    try std.testing.expectEqualStrings("가나다", snapshot.rows.items[0].text);
    try std.testing.expectEqual(@as(u32, 0), snapshot.coverage.created_cell_paragraphs);
    try std.testing.expectEqualDeep(@as(?Stamp, current), snapshot.read_binding);
}
test "document text readonly H5 owner does not borrow caller file bytes" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    @memset(bytes, 0);
    var snapshot = try owner.snapshot(a, issuer, current);
    defer snapshot.deinit();
    try std.testing.expectEqualStrings("가나다", snapshot.rows.items[0].text);
}
test "document text readonly H5 owner cannot be retagged into a successor lifetime" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    try std.testing.expectError(error.StaleDocumentTextReadBinding, owner.snapshot(a, .{ .epoch = 8, .opened = true }, .{ .epoch = 8, .serial = 13 }));
    try std.testing.expectError(error.StaleDocumentTextReadBinding, owner.snapshot(a, issuer, .{ .epoch = 8, .serial = 13 }));
}
test "document text readonly H5 selection uses current Native stamp without an editable Session" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    var snapshot = try owner.snapshot(a, issuer, current);
    defer snapshot.deinit();
    const row = snapshot.rows.items[0];
    var reply = try owner.selection(a, issuer, current, .{
        .binding = snapshot.binding,
        .read_stamp = current,
        .ref = row.ref,
        .start = 1,
        .end = 2,
        .expected = "나",
    });
    defer reply.deinit();
    try std.testing.expectEqualStrings("가나다", reply.before_text);
    try std.testing.expectEqual(@as(u32, 0), reply.target.paragraph.paragraph);
    try std.testing.expectError(error.StaleDocumentTextReadBinding, owner.selection(a, issuer, .{ .epoch = 7, .serial = 14 }, .{
        .binding = snapshot.binding,
        .read_stamp = current,
        .ref = row.ref,
        .start = 1,
        .end = 2,
        .expected = "나",
    }));
}
test "document text readonly H5 caret inverse uses the same immutable source axis" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    var snapshot = try owner.snapshot(a, issuer, current);
    defer snapshot.deinit();
    var reply = try owner.anchor(a, issuer, current, .{
        .binding = snapshot.binding,
        .read_stamp = current,
        .section = 0,
        .target = .{ .paragraph = .{ .paragraph = 0 } },
        .unit = 2,
        .before_text = "가나다",
    });
    defer reply.deinit();
    try std.testing.expectEqualStrings(snapshot.rows.items[0].ref, reply.ref);
    try std.testing.expectEqual(@as(u32, 2), reply.unit);
}
fn allocationTrial(a: std.mem.Allocator, bytes: []const u8) !void {
    const owner = try Owner.open(a, bytes, issuer);
    defer owner.close();
    var snapshot = try owner.snapshot(a, issuer, current);
    defer snapshot.deinit();
    try std.testing.expectEqualStrings("가나다", snapshot.rows.items[0].text);
}
test "document text readonly H5 owner allocation failures retain no borrowed arena or partial owner" {
    const a = std.testing.allocator;
    const bytes = try fixture(a);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, allocationTrial, .{bytes});
}
test "document text readonly H5 owner exposes no edit save history or checkpoint entry" {
    inline for (.{ "apply", "applyBatch", "save", "undo", "redo", "checkpoint", "enableHistory", "splice" }) |name|
        try std.testing.expect(!@hasDecl(Owner, name));
    try std.testing.expectError(error.EditorNotOpen, Owner.open(std.testing.allocator, &.{}, .{}));
}
