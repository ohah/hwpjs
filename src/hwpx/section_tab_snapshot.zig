//! Raw section interval inventory; does not select an effective section definition.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Row = struct { section: usize, node: usize, tab_stop: ?[]const u8, tab_stop_val: ?[]const u8, tab_stop_unit: ?[]const u8, body_owner: ?usize };

fn encodeTrees(a: std.mem.Allocator, trees: []const Tree) ![]u8 {
    var report = try @import("section_definition.zig").inspect(a, trees, .{});
    defer report.deinit(a);
    const rows = try a.alloc(Row, report.definitions.len);
    defer a.free(rows);
    var cursor: usize = 0;
    for (trees, 0..) |*tree, section| {
        var owners = try @import("section_tab_ownership.zig").collect(a, tree);
        defer owners.deinit();
        while (cursor < report.definitions.len and report.definitions[cursor].section_ordinal == section) : (cursor += 1) {
            const definition = &report.definitions[cursor];
            rows[cursor] = .{ .section = section, .node = definition.element_index, .tab_stop = definition.get(.tab_stop), .tab_stop_val = definition.get(.tab_stop_val), .tab_stop_unit = definition.get(.tab_stop_unit), .body_owner = owners.get(definition.element_index) };
        }
    }
    if (cursor != rows.len) return error.SourceBindingMismatch;
    return std.json.Stringify.valueAlloc(a, rows, .{});
}

pub fn encode(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) ![]u8 {
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    return encodeTrees(a, trees);
}

test "HWPX section tab snapshot preserves raw interval presence and unknown units across failures" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:secPr tabStop='8000' tabStopVal='&#43;4000' tabStopUnit='HWPUNIT'/>" ++
        "<p:secPr tabStopVal='0' tabStopUnit='FUTURE'/><p:secPr/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const bytes = try encodeTrees(allocator, &.{input.*});
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("[{\"section\":0,\"node\":1,\"tab_stop\":\"8000\",\"tab_stop_val\":\"+4000\",\"tab_stop_unit\":\"HWPUNIT\",\"body_owner\":null},{\"section\":0,\"node\":2,\"tab_stop\":null,\"tab_stop_val\":\"0\",\"tab_stop_unit\":\"FUTURE\",\"body_owner\":null},{\"section\":0,\"node\":3,\"tab_stop\":null,\"tab_stop_val\":null,\"tab_stop_unit\":null,\"body_owner\":null}]", bytes);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
}
