//! Borrowed source bookmark sites. No editing permission or cache mutation.
const std = @import("std");
const Site = @import("../body/cross_reference_name_target.zig").Site;
const names = @import("control_data_names.zig");
const rules = @import("../body/control_rules.zig");

/// Output array is owned; names borrow the supplied decoded source bytes.
pub fn collect(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: usize) ![]Site {
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    var out: std.ArrayList(Site) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 87) continue;
        const parent = node.parent orelse continue;
        if (parent >= index) return error.UnsupportedControlDataOwner;
        const record = tree.nodes[parent].record.framing;
        if (record.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(record.payload);
        if (header.id != rules.id("%bmk") and header.id != rules.id("bokm")) continue;
        const owner = try names.ownerForTree(tree, index);
        var parameters = try @import("../parameters/parser.zig").Document.parse(a, node.record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
        defer parameters.deinit(a);
        try out.append(a, .{ .section = section, .record_offset = record.offset, .control_id = header.id, .name = try names.name(parameters, owner) });
    }
    return out.toOwnedSlice(a);
}

test "original cross reference named bookmarks resolve eight exact targets with allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/pic-in-head-01.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ bytes, source.header.version() });
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version) !void {
    const sites = try collect(a, bytes, version, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 10), sites.len);
    var fields: usize = 0;
    var ordinary: usize = 0;
    for (sites) |site| {
        if (site.control_id == rules.id("%bmk")) fields += 1;
        if (site.control_id == rules.id("bokm")) ordinary += 1;
    }
    try std.testing.expectEqual(@as(usize, 9), fields);
    try std.testing.expectEqual(@as(usize, 1), ordinary);
    var it = @import("../record.zig").Iterator.init(bytes, .{});
    var count: usize = 0;
    while (try it.next()) |record| {
        if (record.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(record.payload);
        if (header.id != rules.id("%xrf")) continue;
        const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
        const view = try @import("../body/cross_reference_command.zig").View.parse(properties.command);
        if (view.target != .name) continue;
        const name = view.target.name;
        const selected = (try @import("../body/cross_reference_name_target.zig").resolveCommand(view, sites)) orelse return error.TestExpectedEqual;
        try std.testing.expectEqualSlices(u8, name, selected.name);
        try std.testing.expectEqual(rules.id("%bmk"), selected.control_id);
        try std.testing.expect(@intFromPtr(selected.name.ptr) >= @intFromPtr(bytes.ptr) and @intFromPtr(selected.name.ptr) + selected.name.len <= @intFromPtr(bytes.ptr) + bytes.len);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 8), count);
}
