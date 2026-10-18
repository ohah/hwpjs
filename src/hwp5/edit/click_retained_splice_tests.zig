const std = @import("std");
const fixture = @import("click_retained_fixture.zig");
const model = @import("../../model/document.zig");

const Context = struct {
    source: []const u8,
    original: *const model.Section,
    edit: @import("plain_text.zig").Splice,
    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        return @import("click_field_retained_splice.zig").prepare(a, self.source, fixture.version, self.original.*, draft, self.edit, 1);
    }
};
fn applyDraft(a: std.mem.Allocator, bytes: []const u8, section: *model.Section, edit: @import("plain_text.zig").Splice) !void {
    return @import("../../model/transaction.zig").apply(a, section, Context{ .source = bytes, .original = section, .edit = edit }, Context.prepare);
}

fn unchanged(section: model.Section) !void {
    try std.testing.expectEqual(@as(u32, 10), section.paragraphs[0].declared_units);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0 }, section.paragraphs[0].tokens[1].raw);
    try std.testing.expectEqual(@as(u16, 3), std.mem.readInt(u16, section.paragraphs[1].tokens[0].raw[0..2], .little));
    for (section.paragraphs) |p| try std.testing.expect(p.field_attributes == null);
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8) !void {
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{bytes});
    defer document.deinit(a);
    applyDraft(a, bytes, &document.sections[0], .{
        .section = 0,
        .paragraph = 0,
        .start_unit = 8,
        .end_unit = 8,
        .utf8 = "X",
    }) catch |err| {
        try unchanged(document.sections[0]);
        return err;
    };
    try std.testing.expectEqual(@as(u32, 11), document.sections[0].paragraphs[0].declared_units);
    try std.testing.expectEqualSlices(u8, &.{ 'X', 0, 'A', 0 }, document.sections[0].paragraphs[0].tokens[1].raw);
    try std.testing.expectEqual(@as(u32, 10), document.sections[0].paragraphs[1].declared_units);
}

test "retained click splice preserves every partial allocation failure without closing the field" {
    const a = std.testing.allocator;
    const bytes = try fixture.bytes(a);
    defer a.free(bytes);
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{bytes});
}

test "retained click splice rejects uncertain owner before mutation" {
    const a = std.testing.allocator;
    const bytes = try fixture.bytes(a);
    defer a.free(bytes);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{bytes});
    defer document.deinit(a);
    try std.testing.expectError(error.UnsupportedCrossParagraphField, applyDraft(a, bytes, &document.sections[0], .{
        .section = 0,
        .paragraph = 1,
        .start_unit = 0,
        .end_unit = 0,
        .utf8 = "X",
    }));
    try unchanged(document.sections[0]);
    const Splice = @import("plain_text.zig").Splice;
    const cases = [_]struct { edit: Splice, expected: anyerror }{
        .{ .edit = .{ .section = 0, .paragraph = 0, .start_unit = 1, .end_unit = 1, .utf8 = "X" }, .expected = error.SplitControlToken },
        .{ .edit = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 8, .utf8 = "X" }, .expected = error.UnsupportedControlDeletion },
        .{ .edit = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 10, .utf8 = "X" }, .expected = error.InvalidTextPosition },
        .{ .edit = .{ .section = 0, .paragraph = 0, .start_unit = 8, .end_unit = 8, .utf8 = &.{10} }, .expected = error.UnsupportedTextControl },
    };
    for (cases) |case| {
        try std.testing.expectError(case.expected, applyDraft(a, bytes, &document.sections[0], case.edit));
        try unchanged(document.sections[0]);
    }
}
