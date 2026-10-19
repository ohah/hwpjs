//! Current anchors and stored page-control fields; no pagination or sequence evaluation.
const std = @import("std");
const rules = @import("../body/control_rules.zig");
pub const Source = struct {
    kind: enum { position, hide, restart, parity },
    control_node: usize,
    paragraph: usize,
    source_unit: usize,
    current_unit: u32,
    attributes: u32 = 0,
    number: ?u16 = null,
    symbol: ?u16 = null,
    prefix: ?u16 = null,
    suffix: ?u16 = null,
    dash: ?u16 = null,
    extra_bytes: usize = 0,
    extra_nonzero: bool = false,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (links.items, 0..) |link, index| {
        const kind: @FieldType(Source, "kind") = if (link.header_id == rules.id("pgnp")) .position else if (link.header_id == rules.id("pghd")) .hide else if (link.header_id == rules.id("nwno")) .restart else if (link.header_id == rules.id("pgct")) .parity else continue;
        if (link.code != 21) return error.UnsupportedPageControlAnchor;
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingPageControlOwner;
        var row: Source = .{ .kind = kind, .control_node = link.control_node, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]) };
        const properties = tree.nodes[link.control_node].record.value.control_header.properties;
        const extra = switch (kind) {
            .position => blk: {
                const value = try @import("../body/page_number.zig").Properties.parse(properties);
                row.attributes = value.attributes;
                row.symbol = value.symbol;
                row.prefix = value.prefix;
                row.suffix = value.suffix;
                row.dash = value.dash;
                break :blk value.extra;
            },
            .hide => blk: {
                const value = try @import("../body/page_visibility.zig").Hide.parse(properties, .observed32);
                row.attributes = value.attributes;
                break :blk value.extra;
            },
            .restart => blk: {
                const value = try @import("../body/number_control.zig").Restart.parse(properties);
                row.attributes = value.header.attributes;
                row.number = value.header.number;
                break :blk value.extra;
            },
            .parity => blk: {
                const value = try @import("../body/page_visibility.zig").Parity.parse(properties);
                row.attributes = value.attributes;
                break :blk value.extra;
            },
        };
        row.extra_bytes = extra.len;
        for (extra) |byte| if (byte != 0) {
            row.extra_nonzero = true;
            break;
        };
        try out.append(a, row);
    }
    return out.toOwnedSlice(a);
}

test "HWP5 page control sources actual distribution anchors shift and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/distribution.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.openDistribution(a, bytes);
    defer session.close();
    const rows = try session.pageControlSources(a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 4), rows.len);
    try std.testing.expectEqual(.position, rows[0].kind);
    try std.testing.expectEqual(@as(usize, 12), rows[0].control_node);
    try std.testing.expectEqual(@as(u32, 0x600), rows[0].attributes);
    try std.testing.expectEqual(.hide, rows[1].kind);
    try std.testing.expectEqual(.hide, rows[2].kind);
    try std.testing.expectEqual(.restart, rows[3].kind);
    try std.testing.expectEqual(@as(?u16, 1), rows[3].number);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" } });
    const shifted = try session.pageControlSources(a, 0);
    defer a.free(shifted);
    for (rows, shifted) |before, after| {
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + @as(u32, if (before.paragraph == 0) 3 else 0), after.current_unit);
    }
    try std.testing.expectError(error.InvalidSection, session.pageControlSources(a, 999));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Source) !void {
            const actual = try s.pageControlSources(allocator, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ session, shifted });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("style_preservation.zig").Session.openDistribution(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.pageControlSources(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(shifted.len, restored.len);
    for (shifted, restored) |before, after| {
        try std.testing.expectEqual(before.current_unit, after.current_unit);
        try std.testing.expectEqual(after.source_unit, after.current_unit);
        var normalized = after;
        normalized.control_node = before.control_node;
        normalized.source_unit = before.source_unit;
        try std.testing.expectEqualDeep(before, normalized);
    }
}
