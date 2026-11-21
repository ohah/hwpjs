//! Own synthetic generated cells only. Prepared tests, not execution evidence.
const std = @import("std");
const a = std.testing.allocator;
const model = @import("model/created_table.zig");
const values = @import("model/created_cell_properties_values.zig");
const prep = @import("model/created_cell_properties_table.zig");
const Alignment = @import("model/cell_vertical_alignment.zig").Alignment;
const Ticket = @import("model/history_mutation_epoch.zig").Ticket;
const ticket: Ticket = .{ .binding = .{ .document = 1, .generation = 2, .owner = 3 }, .epoch = 4 };
fn fixture(allocator: std.mem.Allocator) !model.Table {
    var table = try model.create(allocator, 17, 19, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), &.{ 1, 2, 3, 4 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    errdefer table.deinit(allocator);
    _ = try table.replaceText(allocator, 0, 1, "selected", 100);
    return table;
}
fn request(value: Alignment) values.Request {
    return .{ .address = .{ .section = 0, .identity = 17, .row = 0, .column = 1 }, .expected_ticket = ticket, .expected = .{ .width = 100, .height = 20 }, .vertical_alignment = value };
}
test "created cell valign model effective no-op base reset exact budget and peer preservation" {
    var source = try fixture(a);
    defer source.deinit(a);
    try std.testing.expect((try prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.center), 100000, .center)) == null);
    const cap = @max(@sizeOf(values.Entry), 4 * @sizeOf(@import("model/created_cell_property.zig").Property));
    try std.testing.expectError(error.LimitExceeded, prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.bottom), cap - 1, .center));
    var edited = (try prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.bottom), cap, .center)).?;
    defer edited.deinit(a);
    try std.testing.expectEqual(@as(?Alignment, .bottom), try edited.cellVerticalAlignment(0, 1, .center));
    try std.testing.expectEqual(@as(?Alignment, .center), try edited.cellVerticalAlignment(0, 0, .center));
    try std.testing.expectEqualDeep(source.cells[1], edited.cells[1]);
    try std.testing.expectEqualDeep(source.resources, edited.resources);
    var reset = (try prep.prepareWithAlignmentBase(a, &edited, 0, ticket, request(.center), cap, .center)).?;
    defer reset.deinit(a);
    try std.testing.expectEqual(@as(?Alignment, null), reset.cell_properties[1].vertical_alignment);
}
test "created cell valign unknown base stale full ticket and invalid address reject unchanged" {
    var source = try fixture(a);
    defer source.deinit(a);
    try std.testing.expectError(error.UnsupportedCreatedCellVerticalAlignment, prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.top), 100000, null));
    var stale = request(.bottom);
    stale.expected_ticket.epoch += 1;
    try std.testing.expectError(error.StaleMutationEpoch, prep.prepareWithAlignmentBase(a, &source, 0, ticket, stale, 100000, .top));
    stale = request(.bottom);
    stale.expected_ticket.binding.owner += 1;
    try std.testing.expectError(error.SourceBindingMismatch, prep.prepareWithAlignmentBase(a, &source, 0, ticket, stale, 100000, .top));
    stale = request(.bottom);
    stale.address.identity += 1;
    try std.testing.expectError(error.InvalidCreatedTableIdentity, prep.prepareWithAlignmentBase(a, &source, 0, ticket, stale, 100000, .top));
    try std.testing.expectEqual(@as(usize, 0), source.cell_properties.len);
}
test "created cell valign grid remaps override and new cells retain base" {
    var source = try fixture(a);
    defer source.deinit(a);
    var edited = (try prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.bottom), 100000, .top)).?;
    defer edited.deinit(a);
    var moved = try @import("model/created_table_grid.zig").edit(a, &edited, .{ .insert_column = 1 }, &.{ 5, 6 }, .{ .max_cells = 6, .max_text_bytes = 100000 });
    defer moved.deinit(a);
    try std.testing.expectEqual(@as(?Alignment, .bottom), try moved.cellVerticalAlignment(0, 2, .top));
    try std.testing.expectEqual(@as(?Alignment, .top), try moved.cellVerticalAlignment(0, 1, .top));
    try std.testing.expectEqualStrings("selected", moved.cells[2].text);
}
test "created cell valign H5 explicit spec6 observed8 only selected attribute mask changes" {
    var source = try fixture(a);
    defer source.deinit(a);
    var edited = (try prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.bottom), 100000, .center)).?;
    defer edited.deinit(a);
    const records = @import("hwp5/edit/created_table_cell_records.zig");
    for ([_]@import("hwp5/body/list_header.zig").Layout{ .spec6, .observed8 }) |layout| {
        const options: records.Options = .{ .layout = layout, .unknown = if (layout == .observed8) 0x1234 else null, .attributes = 0x80400025, .margins = .{ 1, 2, 3, 4 } };
        for (0..2) |column| {
            var before: std.ArrayList(u8) = .empty;
            defer before.deinit(a);
            var after: std.ArrayList(u8) = .empty;
            defer after.deinit(a);
            try records.append(a, &before, &source, 0, @intCast(column), .{ .raw = 0x05000302 }, options, .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 }, 2, 100000);
            try records.append(a, &after, &edited, 0, @intCast(column), .{ .raw = 0x05000302 }, options, .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 }, 2, 100000);
            var it = @import("hwp5/record.zig").Iterator.init(after.items, .{});
            const list = (try it.next()).?;
            const at: usize = if (layout == .observed8) 4 else 2;
            const expected: u32 = if (column == 1) (options.attributes & ~@as(u32, 0x60)) | 0x40 else options.attributes;
            try std.testing.expectEqual(expected, std.mem.readInt(u32, list.payload[at..][0..4], .little));
            if (column == 1) {
                // Compare every serialized byte after restoring just the owned bits.
                const patch_at = @intFromPtr(list.payload.ptr) - @intFromPtr(after.items.ptr) + at;
                std.mem.writeInt(u32, after.items[patch_at..][0..4], options.attributes, .little);
            }
            try std.testing.expectEqualSlices(u8, before.items, after.items);
        }
    }
}
test "created cell valign HX selected subList changes and object anchor stays TOP" {
    var source = try fixture(a);
    defer source.deinit(a);
    var edited = (try prep.prepareWithAlignmentBase(a, &source, 0, ticket, request(.center), 100000, .top)).?;
    defer edited.deinit(a);
    const before = try @import("hwpx/created_table_xml.zig").write(a, &source, 100000);
    defer a.free(before);
    const after = try @import("hwpx/created_table_xml.zig").write(a, &edited, 100000);
    defer a.free(after);
    const needle = "vertAlign=\"CENTER\"";
    const at = std.mem.indexOf(u8, after, needle).?;
    try std.testing.expect(std.mem.indexOf(u8, after[at + needle.len ..], needle) == null);
    const restored = try std.mem.concat(a, u8, &.{ after[0..at], "vertAlign=\"TOP\"", after[at + needle.len ..] });
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, before, restored);
}
fn allocationCase(allocator: std.mem.Allocator) !void {
    var source = try fixture(allocator);
    defer source.deinit(allocator);
    var edited = (try prep.prepareWithAlignmentBase(allocator, &source, 0, ticket, request(.bottom), 100000, .top)).?;
    defer edited.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 0), source.cell_properties.len);
}
test "created cell valign model allocation failures release owned candidates" {
    try @import("testing/allocation_failures.zig").check(allocationCase, .{});
}
