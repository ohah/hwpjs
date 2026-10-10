//! Fresh projection of immutable header and current resource intents.
const std = @import("std");
const Row = @import("../model/character_strike_snapshot.zig").Row;
const current = @import("character_strike_current.zig");
const SourceIndex = std.AutoHashMap(u32, ?bool);
pub fn read(session: *const @import("editor_session.zig").Session) ![]Row {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const ids = resources.table(.char_shape).ids.items;
    var source = try sourceIndex(a, &tree, ids);
    defer source.deinit();
    const rows = try a.alloc(Row, ids.len + session.character_resources.entries.items.len);
    errdefer a.free(rows);
    for (ids, 0..) |id, index| rows[index] = try row(session, &source, id);
    for (session.character_resources.entries.items, 0..) |entry, index| rows[ids.len + index] = try row(session, &source, entry.id);
    std.mem.sort(Row, rows, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            return left.id < right.id;
        }
    }.less);
    for (rows, 0..) |value, index| if (index > 0 and rows[index - 1].id == value.id) return error.DuplicateCharacterResourceId;
    return rows;
}
fn row(session: *const @import("editor_session.zig").Session, source: *const SourceIndex, id: u32) !Row {
    const enabled = switch (current.intent(session, id)) {
        .enabled => |enabled| @as(?bool, enabled),
        .source_id => |source_id| source.get(source_id) orelse return error.InvalidCharacterShapeReference,
    };
    return .{ .id = id, .enabled = enabled };
}

fn sourceIndex(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, ids: []const u32) !SourceIndex {
    var result = SourceIndex.init(a);
    errdefer result.deinit();
    var wanted = std.AutoHashMap(u32, void).init(a);
    defer wanted.deinit();
    for (ids) |id| try wanted.put(id, {});
    if (wanted.count() == 0) return result;
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        const shape = try @import("character_shape_display.zig").read(a, tree, index, 4096);
        const id = shape.id orelse continue;
        if (!wanted.contains(id)) continue;
        const enabled = current.readNode(a, tree, index) catch |err| switch (err) {
            error.UnsupportedCharacterStrikeShape => @as(?bool, null),
            else => return err,
        };
        const entry = try result.getOrPut(id);
        if (entry.found_existing) return error.DuplicateCharacterResourceId;
        entry.value_ptr.* = enabled;
        // Individual lookups stop at their match. Do not validate unrelated
        // trailing resources after every requested source has been found.
        if (result.count() == wanted.count()) break;
    }
    return result;
}

test "HWPX strike snapshot source index preserves sparse unknown absent and allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:charProperties><h:charPr id='9'><h:strikeout shape='NONE'/></h:charPr><h:charPr id='7'><h:strikeout shape='DOT'/></h:charPr><h:charPr id='8'><h:strikeout shape='FUTURE'/></h:charPr><h:charPr id='0'/><h:charPr height='bad'/></h:charProperties></h:refList></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree) !void {
            var index = try sourceIndex(allocator, parsed, &.{ 9, 7, 8, 0 });
            defer index.deinit();
            try std.testing.expectEqual(@as(?bool, false), index.get(9).?);
            try std.testing.expectEqual(@as(?bool, true), index.get(7).?);
            try std.testing.expectEqual(@as(?bool, null), index.get(8).?);
            try std.testing.expectEqual(@as(?bool, false), index.get(0).?);
            try std.testing.expect(index.get(99) == null);
        }
    }.run, .{&tree});
}

test "HWPX strike snapshot matches individual reads with explicit and inherited current resources" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try session.character_resources.entries.appendSlice(a, &.{
        .{ .id = 99, .source_id = 7, .properties = .{ .strike_enabled = false } },
        .{ .id = 100, .source_id = 0, .properties = .{ .strike_enabled = true } },
        .{ .id = 101, .source_id = 8, .properties = .{ .bold = true } },
    });
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const values = try read(&session);
    defer a.free(values);
    try std.testing.expectEqual(@as(usize, 15), values.len);
    for (values) |value| try std.testing.expectEqual(try current.read(&session, &tree, value.id), value.enabled.?);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var borrowed = original.*;
            borrowed.allocator = allocator;
            const snapshot = try read(&borrowed);
            defer allocator.free(snapshot);
            try std.testing.expectEqual(@as(usize, 15), snapshot.len);
        }
    }.run, .{&session});
    try session.character_resources.entries.append(a, .{ .id = 102, .source_id = 999, .properties = .{ .bold = true } });
    try std.testing.expectError(error.InvalidCharacterShapeReference, read(&session));
    try std.testing.expectEqualSlices(u8, input, session.source);
}
