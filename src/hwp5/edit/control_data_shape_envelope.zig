//! Exact retained shape envelopes, not inferred names or executable links.
const std = @import("std");
const parameters = @import("../parameters/parser.zig");
pub const Kind = enum { empty_set, mirrored_strings };

pub fn classify(doc: parameters.Document) ?Kind {
    if (doc.extra.len != 0 or doc.nodes.len < 2) return null;
    const root = doc.nodes[0];
    if (root.parent != null or root.item_id != null or root.wire_type != null or root.subtree_end != doc.nodes.len or root.value != .set or
        root.value.set.id != 0x021b or root.value.set.count != 1 or root.value.set.reserved != 0) return null;
    const nested = doc.nodes[1];
    if (nested.parent != 0 or nested.item_id != 0x026f or nested.wire_type != 0x8000 or nested.subtree_end != doc.nodes.len or nested.value != .set or
        nested.value.set.id != 0x026f or nested.value.set.reserved != 0) return null;
    if (doc.nodes.len == 2 and nested.value.set.count == 0) return .empty_set;
    if (doc.nodes.len != 4 or nested.value.set.count != 2) return null;
    var first: ?[]const u8 = null;
    var second: ?[]const u8 = null;
    for (doc.nodes[2..], 2..) |node, index| {
        if (node.parent != 1 or node.wire_type != 1 or node.value != .string or node.subtree_end != index + 1) return null;
        if (node.item_id == 0x0265 and first == null) first = node.value.string else if (node.item_id == 0x6065 and second == null) second = node.value.string else return null;
    }
    if (first == null or second == null or !std.mem.eql(u8, first.?, second.?)) return null;
    return .mirrored_strings;
}

test "retained shape envelopes distinguish empty data and mirrored strings and reject schema mutations" {
    const a = std.testing.allocator;
    var empty_buffer: [16]u8 = undefined;
    const empty = try std.fmt.hexToBytes(&empty_buffer, "1b02010000006f0200806f0200000000");
    var empty_doc = try parameters.Document.parse(a, empty, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer empty_doc.deinit(a);
    try std.testing.expectEqual(Kind.empty_set, classify(empty_doc));
    empty_doc.nodes[1].value.set.reserved = 1;
    try std.testing.expectEqual(@as(?Kind, null), classify(empty_doc));
    var buffer: [64]u8 = undefined;
    const bytes = try std.fmt.hexToBytes(&buffer, "1b02010000006f0200806f020200000065020100010041006560010001004100");
    var doc = try parameters.Document.parse(a, bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try std.testing.expectEqual(Kind.mirrored_strings, classify(doc));
    std.mem.swap(parameters.Node, &doc.nodes[2], &doc.nodes[3]);
    doc.nodes[2].subtree_end = 3;
    doc.nodes[3].subtree_end = 4;
    try std.testing.expectEqual(Kind.mirrored_strings, classify(doc));
    doc.nodes[2].value.string = &.{ 0x42, 0 };
    try std.testing.expectEqual(@as(?Kind, null), classify(doc));
    doc.nodes[2].value.string = doc.nodes[3].value.string;
    doc.extra = &.{0};
    try std.testing.expectEqual(@as(?Kind, null), classify(doc));
    doc.extra = &.{};
    const original = try a.dupe(parameters.Node, doc.nodes);
    defer a.free(original);
    for (0..14) |mutation| {
        @memcpy(doc.nodes, original);
        switch (mutation) {
            0 => doc.nodes[0].value.set.count = 2,
            1 => doc.nodes[1].value.set.id = 0x0270,
            2 => doc.nodes[2].item_id = doc.nodes[3].item_id,
            3 => doc.nodes[2].parent = 0,
            4 => doc.nodes[2].wire_type = 4,
            5 => doc.nodes[2].value = .{ .integer = 42 },
            6 => doc.nodes[2].subtree_end = 4,
            7 => doc.nodes[1].wire_type = 1,
            8 => doc.nodes[0].value.set.reserved = 1,
            9 => doc.nodes[0].parent = 0,
            10 => doc.nodes[0].item_id = 0x021b,
            11 => doc.nodes[1].parent = null,
            12 => doc.nodes[1].value.set.count = 3,
            13 => doc.nodes[0].subtree_end = 3,
            else => unreachable,
        }
        try std.testing.expectEqual(@as(?Kind, null), classify(doc));
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, raw: []const u8) !void {
            var parsed = try parameters.Document.parse(allocator, raw, .{ .header_layout = .observed6, .null_layout = .observed_empty });
            defer parsed.deinit(allocator);
            try std.testing.expectEqual(Kind.mirrored_strings, classify(parsed));
        }
    }.run, .{bytes});
}
