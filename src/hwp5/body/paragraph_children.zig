const body = @import("reader.zig");
const Tree = @import("tree.zig").Tree;
pub const Children = struct { text_node: ?usize = null, metadata: body.Metadata = .{} };
/// Shared direct-child association and uniqueness rules; no resource validation.
pub fn collect(tree: Tree, paragraph: usize) !Children {
    var result: Children = .{};
    var child = paragraph + 1;
    while (child < tree.nodes[paragraph].subtree_end) {
        const entry = tree.nodes[child];
        switch (entry.record.value) {
            .text => {
                if (result.text_node != null) return error.DuplicateParagraphRecord;
                result.text_node = child;
            },
            .char_runs => |v| {
                if (result.metadata.runs != null) return error.DuplicateParagraphRecord;
                result.metadata.runs = v;
            },
            .line_segments => |v| {
                if (result.metadata.lines != null) return error.DuplicateParagraphRecord;
                result.metadata.lines = v;
            },
            .range_tags => |v| {
                if (result.metadata.ranges != null) return error.DuplicateParagraphRecord;
                result.metadata.ranges = v;
            },
            else => {},
        }
        child = entry.subtree_end;
    }
    return result;
}
