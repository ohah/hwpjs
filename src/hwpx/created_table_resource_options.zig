//! Actual existing resource IDs only; never guess style/border defaults.
const std = @import("std");
pub const Options = struct {
    paragraph: []u32,
    character: []u32,
    style: []u32,
    border_fill: []u32,
    pub fn deinit(self: *Options, a: std.mem.Allocator) void {
        inline for (std.meta.fields(Options)) |field| a.free(@field(self, field.name));
    }
};
fn ids(a: std.mem.Allocator, original: []const u32, entries: anytype) ![]u32 {
    var list: std.ArrayList(u32) = .empty;
    defer list.deinit(a);
    try list.appendSlice(a, original);
    for (entries) |entry| try list.append(a, entry.id);
    std.mem.sort(u32, list.items, {}, std.sort.asc(u32));
    for (list.items, 0..) |id, index| if (index > 0 and id == list.items[index - 1]) return error.InvalidResourceIdOrder;
    return list.toOwnedSlice(a);
}
pub fn read(session: *const @import("editor_session.zig").Session) !Options {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var report = try document.inspectHeaderResources(a, .{ .resources = .{ .max_xml_bytes = session.options.max_xml_bytes } });
    defer report.deinit(a);
    const paragraph = try ids(a, report.table(.para_shape).ids.items, session.paragraph_resources.entries.items);
    errdefer a.free(paragraph);
    const character = try ids(a, report.table(.char_shape).ids.items, session.character_resources.entries.items);
    errdefer a.free(character);
    const style = try a.dupe(u32, report.table(.style).ids.items);
    errdefer a.free(style);
    return .{ .paragraph = paragraph, .character = character, .style = style, .border_fill = try a.dupe(u32, report.table(.border_fill).ids.items) };
}

test "created table resource options retain sparse IDs and clean every list allocation failure" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const Entry = struct { id: u32 };
            const entries = [_]Entry{ .{ .id = 3 }, .{ .id = 1 } };
            const values = try ids(allocator, &.{ 0, 9, 0xffffffff }, &entries);
            defer allocator.free(values);
            try std.testing.expectEqualSlices(u32, &.{ 0, 1, 3, 9, 0xffffffff }, values);
        }
    }.run, .{});
    const Entry = struct { id: u32 };
    try std.testing.expectError(error.InvalidResourceIdOrder, ids(a, &.{0}, &[_]Entry{.{ .id = 0 }}));
}
