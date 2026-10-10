//! Source insertion boundaries around direct protected anchors; no text is invented.
const trees = @import("xml_part_tree.zig");
const anchors = @import("run_anchor.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Iterator = struct {
    tree: *const trees.Tree,
    child: ?usize,
    pending_end: ?usize = null,
    previous: ?usize = null,

    pub fn init(tree: *const trees.Tree, run_index: usize) Iterator {
        var result: Iterator = .{ .tree = tree, .child = null };
        if (run_index >= tree.elements.len) return result;
        const run = tree.elements[run_index];
        if (!run.is(uri, "run")) return result;
        result.child = run.first_child;
        return result;
    }

    pub fn next(self: *Iterator) ?usize {
        while (true) {
            if (self.pending_end) |end| {
                self.pending_end = null;
                if (self.previous != end) {
                    self.previous = end;
                    return end;
                }
            }
            const index = self.child orelse return null;
            const child = self.tree.elements[index];
            self.child = child.next_sibling;
            _ = anchors.kind(self.tree, index) orelse continue;
            // Anchor-mode collection needs both sides of note numbering too.
            // Plain insertion affinity still prefers existing source text.
            self.pending_end = child.end;
            const start = child.start_tag.start;
            if (self.previous != start) {
                self.previous = start;
                return start;
            }
        }
    }
};
