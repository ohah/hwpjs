//! Source insertion boundaries around direct protected anchors; no text is invented.
const trees = @import("xml_part_tree.zig");
const anchors = @import("run_anchor.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Iterator = struct {
    tree: *const trees.Tree,
    child: ?usize,
    pending_end: ?usize = null,
    previous: ?usize = null,
    note_paragraph: bool = false,

    pub fn init(tree: *const trees.Tree, run_index: usize) Iterator {
        var result: Iterator = .{ .tree = tree, .child = null };
        if (run_index >= tree.elements.len) return result;
        const run = tree.elements[run_index];
        if (!run.is(uri, "run")) return result;
        result.child = run.first_child;
        if (run.parent) |p| if (tree.elements[p].parent) |list| {
            if (tree.elements[list].is(uri, "subList")) if (tree.elements[list].parent) |note| {
                result.note_paragraph = tree.elements[note].is(uri, "footNote") or tree.elements[note].is(uri, "endNote");
            };
        };
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
            const kind = anchors.kind(self.tree, index) orelse continue;
            // Preserve the existing zero-width plain note-prefix contract.
            if (kind == .automatic_number and self.note_paragraph) continue;
            self.pending_end = child.end;
            const start = child.start_tag.start;
            if (self.previous != start) {
                self.previous = start;
                return start;
            }
        }
    }
};
