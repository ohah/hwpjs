const Tree = @import("tree.zig").Tree;
const Collector = @import("../memo_references.zig").Collector;
/// Collects observed IDs only, without inferring paragraph-spanning field ranges.
pub fn collect(tree: Tree, c: Collector) !void {
    for (tree.nodes) |node| {
        if (node.record.value != .text) continue;
        var tokens = node.record.value.text.tokens();
        while (try tokens.next()) |token| {
            if (token.value != .control or token.value.control.code != 4) continue;
            if (try @import("memo_end.zig").parse(token.value.control.data)) |end| {
                try c.index.addEnd(c.allocator, end.memo_index, c.section);
            }
        }
    }
}
