const std = @import("std");
const t = std.testing;
const session = @import("ole_edit_session.zig");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");
const fixture = @import("../document/test_fixture.zig");

fn inner(a: std.mem.Allocator, marker: []const u8) ![]u8 {
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "A", .parent = 0, .content = marker },
        .{ .name = "B", .parent = 0, .content = marker },
        .{ .name = "Keep", .parent = 0, .content = marker },
    }, .{ .version = 4 });
}

fn make(a: std.mem.Allocator, second_id: u16, corrupt_second: bool) ![]u8 {
    return makeDeclared(a, second_id, corrupt_second, 2);
}

fn makeDeclared(a: std.mem.Allocator, second_id: u16, corrupt_second: bool, declared_bins: i32) ![]u8 {
    const first_inner = try inner(a, "first-old");
    defer a.free(first_inner);
    const second_valid = try inner(a, "second-old");
    defer a.free(second_valid);
    var header = fixture.header();
    fixture.put(&header, 36, u32, 0);
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    var mappings = [_]u8{0} ** 60;
    fixture.put(&mappings, 0, i32, declared_bins);
    try fixture.frame(a, &doc, 17, 0, &mappings);
    var first = [_]u8{ 0x22, 0, 7, 0 };
    var second = [_]u8{ 0x22, 0, 0, 0 };
    fixture.put(&second, 2, u16, second_id);
    try fixture.frame(a, &doc, 18, 1, &first);
    try fixture.frame(a, &doc, 18, 1, &second);
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = doc.items },
        .{ .name = "BinData", .kind = 1, .parent = 0 },
        .{ .name = "BIN0007", .parent = 3, .content = first_inner },
        .{ .name = "BIN0009", .parent = 3, .content = if (corrupt_second) "bad" else second_valid },
        .{ .name = "OuterKeep", .parent = 0, .content = "outer-preserved" },
    }, .{ .version = 3 });
}

const commands = [_]session.Command{
    .{ .ordinal = 1, .layout = .raw_cfb, .replacements = &.{ .{ .path = "/B", .content = "first-new-b" }, .{ .path = "/A", .content = "first-new-a" } } },
    .{ .ordinal = 2, .layout = .raw_cfb, .replacements = &.{ .{ .path = "/A", .content = "second-new-a" }, .{ .path = "/B", .content = "second-new-b" } } },
};

fn exercise(a: std.mem.Allocator) !void {
    const input = try make(a, 9, false);
    defer a.free(input);
    const output = try session.apply(a, input, &commands, .specified, .{ .bin_data = .{ .max_doc_info_bytes = 128, .max_encoded_bytes = 64 * 1024, .max_total_encoded_bytes = 128 * 1024, .max_output_bytes = 256 * 1024 }, .ole = .{ .max_output_bytes = 64 * 1024 }, .max_decoded_bin_data_bytes = 64 * 1024, .max_total_decoded_bin_data_bytes = 128 * 1024 });
    defer a.free(output);
    var outer = try cfb.File.open(a, output, .{ .strict = true });
    defer outer.deinit();
    try t.expectEqual(@as(u16, 3), outer.header.major);
    try t.expectEqualStrings("outer-preserved", outer.entries[(try outer.findExact("/OuterKeep")).?].content);
    for ([_]struct { path: []const u8, a_value: []const u8, b_value: []const u8, keep: []const u8 }{
        .{ .path = "/BinData/BIN0007", .a_value = "first-new-a", .b_value = "first-new-b", .keep = "first-old" },
        .{ .path = "/BinData/BIN0009", .a_value = "second-new-a", .b_value = "second-new-b", .keep = "second-old" },
    }) |expected| {
        var ole = try cfb.File.open(a, outer.entries[(try outer.findExact(expected.path)).?].content, .{ .strict = true });
        defer ole.deinit();
        try t.expectEqual(@as(u16, 4), ole.header.major);
        try t.expectEqualStrings(expected.a_value, ole.entries[(try ole.findExact("/A")).?].content);
        try t.expectEqualStrings(expected.b_value, ole.entries[(try ole.findExact("/B")).?].content);
        try t.expectEqualStrings(expected.keep, ole.entries[(try ole.findExact("/Keep")).?].content);
    }
}

test "file OLE edit session commits two inner batches through one outer batch" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}

test "file OLE edit session rejects command and late inner failures atomically" {
    const input = try make(t.allocator, 9, false);
    defer t.allocator.free(input);
    try t.expectError(error.EmptyOleEditSet, session.apply(t.allocator, input, &.{}, .specified, .{}));
    try t.expectError(error.LimitExceeded, session.apply(t.allocator, input, &commands, .specified, .{ .bin_data = .{ .max_edits = 1 } }));
    const reversed = [_]session.Command{ commands[1], commands[0] };
    try t.expectError(error.InvalidBinDataOrdinalOrder, session.apply(t.allocator, input, &reversed, .specified, .{}));
    const duplicate = [_]session.Command{ commands[0], commands[0] };
    try t.expectError(error.InvalidBinDataOrdinalOrder, session.apply(t.allocator, input, &duplicate, .specified, .{}));
    try t.expectError(error.LimitExceeded, session.apply(t.allocator, input, &commands, .specified, .{ .max_total_decoded_bin_data_bytes = 1 }));
    try t.expectError(error.LimitExceeded, session.apply(t.allocator, input, &commands, .specified, .{ .max_total_edited_ole_bytes = 32 * 1024 }));
    const corrupt = try make(t.allocator, 9, true);
    defer t.allocator.free(corrupt);
    try t.expectError(error.Truncated, session.apply(t.allocator, corrupt, &commands, .specified, .{}));
    const missing = try make(t.allocator, 8, false);
    defer t.allocator.free(missing);
    try t.expectError(error.MissingHwpEntry, session.apply(t.allocator, missing, &commands, .specified, .{}));
    const mismatched = try makeDeclared(t.allocator, 9, false, 1);
    defer t.allocator.free(mismatched);
    try t.expectError(error.ResourceCountMismatch, session.apply(t.allocator, mismatched, &commands, .specified, .{}));
    const mismatched_corrupt = try makeDeclared(t.allocator, 9, true, 1);
    defer t.allocator.free(mismatched_corrupt);
    try t.expectError(error.ResourceCountMismatch, session.apply(t.allocator, mismatched_corrupt, &commands, .specified, .{}));
    var unchanged = try cfb.File.open(t.allocator, input, .{ .strict = true });
    defer unchanged.deinit();
    try t.expectEqualStrings("outer-preserved", unchanged.entries[(try unchanged.findExact("/OuterKeep")).?].content);
}
