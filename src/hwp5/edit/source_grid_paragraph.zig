//! Read-only source eligibility. A TABLE atno is not an arbitrary field/control.
const std = @import("std");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const rules = @import("../body/control_rules.zig");
pub const Policy = enum { strict_no_cache, validated_cache };
pub const Result = struct { runs: usize, numbers: usize };
pub fn inspect(tree: Tree, index: usize, end: usize, caption: bool, policy: Policy) !Result {
    const node = tree.nodes[index];
    if (node.record.value != .header or node.subtree_end > end) return error.UnsupportedSourceTableGrid;
    const h = node.record.value.header;
    if ((h.merge_tracking orelse 0) != 0 or h.break_flags != 0 or h.range_tag_count != 0 or h.extra.len != 0) return error.UnsupportedSourceTableGrid;
    if (policy == .strict_no_cache and h.line_segment_count != 0) return error.UnsupportedSourceTableGrid;
    try @import("source_grid_line_cache.zig").validate(tree, index);
    var runs: ?usize = null;
    var text: ?usize = null;
    var number: ?usize = null;
    var child = index + 1;
    while (child < node.subtree_end) : (child = tree.nodes[child].subtree_end) {
        const e = tree.nodes[child];
        if (e.parent != index or e.subtree_end != child + 1) return error.UnsupportedSourceTableGrid;
        switch (e.record.value) {
            .text => {
                if (text != null) return error.UnsupportedSourceTableGrid;
                text = child;
            },
            .char_runs => {
                if (runs != null) return error.UnsupportedSourceTableGrid;
                runs = child;
            },
            .line_segments => {
                if (policy == .strict_no_cache) return error.UnsupportedSourceTableGrid;
            }, // Validated typed derived cache; writer removes it.
            .control_header => |control| {
                if (!caption or number != null or control.id != rules.id("atno")) return error.UnsupportedSourceTableGrid;
                const v = try @import("../body/number_control.zig").Auto.parse(control.properties);
                if (v.header.attributes != 4 or v.header.number == 0 or v.extra.len != 0 or v.symbol != 0 or v.prefix != 0 or v.suffix != 0) return error.UnsupportedSourceTableGrid;
                number = child;
            },
            else => return error.UnsupportedSourceTableGrid,
        }
    }
    const ri = runs orelse return error.UnsupportedSourceTableGrid;
    const rows = tree.nodes[ri].record.value.char_runs;
    if (rows.count() == 0 or rows.count() != h.char_shape_count) return error.UnsupportedSourceTableGrid;
    const bytes = if (text) |t| tree.nodes[t].record.framing.payload else &.{};
    if (h.control_mask != (if (number != null) @as(u32, 1) << 18 else @as(u32, 0))) return error.UnsupportedSourceTableGrid;
    // Known implicit one-unit terminators are independent of the cache policy.
    // Strict still rejects both declared and present caches above. Rawcopy retains
    // the original absence; newly authored empty cells use the same wire form.
    if (bytes.len == 0 and (h.characterUnits() == 0 or (h.characterUnits() == 1 and text == null))) {
        if (number != null or rows.count() != 1 or rows.get(0).?.start != 0) return error.UnsupportedSourceTableGrid;
        return .{ .runs = ri, .numbers = 0 };
    }
    if (policy == .strict_no_cache and text == null) return error.UnsupportedSourceTableGrid;
    if (text == null or bytes.len / 2 != h.characterUnits()) return error.SourceBindingMismatch;
    if (number == null) try @import("plain_text_content.zig").validatePlain(bytes) else {
        var tokens = try body.text.Iterator.init(bytes);
        var anchors: usize = 0;
        var terminated = false;
        while (try tokens.next()) |token| switch (token.value) {
            .text => |plain| {
                if (terminated) return error.UnsupportedSourceTableGrid;
                var at: usize = 0;
                while (try @import("../../text/scalars.zig").read(plain, at, .utf16le)) |c| at = c.end;
            },
            .control => |c| {
                if (terminated) return error.UnsupportedSourceTableGrid;
                if (c.code == 13) {
                    terminated = true;
                    continue;
                }
                if (c.code != 18 or c.kind != .extended or anchors != 0 or std.mem.readInt(u32, c.data[0..4], .little) != rules.id("atno")) return error.UnsupportedSourceTableGrid;
                for (c.data[4..]) |b| if (b != 0) return error.UnsupportedSourceTableGrid;
                anchors += 1;
            },
        };
        if (!terminated or anchors != 1) return error.UnsupportedSourceTableGrid;
    }
    var previous: u32 = 0;
    for (0..rows.count()) |i| {
        const run = rows.get(i).?;
        if ((i == 0 and run.start != 0) or (i > 0 and run.start <= previous)) return error.UnsupportedSourceTableGrid;
        try @import("plain_text_content.zig").boundary(bytes, run.start);
        previous = run.start;
    }
    return .{ .runs = ri, .numbers = @intFromBool(number != null) };
}
