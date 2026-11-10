//! Offset lookup for one unchanged parsed section, queried in record order.
//! Tree.parseTextPreview preserves framing's strictly increasing source offsets.
//! No ownership/policy success is inferred here: callers validate the found node.
const Tree = @import("../body/tree.zig").Tree;
const testing = @import("builtin").is_test;
pub const Work = if (testing) struct {
    lookups: usize = 0,
    comparisons: usize = 0,
    advances: usize = 0,
} else void;
pub const Cursor = struct {
    index: usize = 0,
    /// Queries must be nondecreasing and nodes must remain in source order.
    /// Do not consume matches: repeated/duplicate offsets retain the original
    /// full scan's first matching node. Parsed source cannot contain duplicates.
    pub fn find(self: *Cursor, tree: Tree, offset: usize, work: if (testing) ?*Work else void) !usize {
        if (testing) if (work) |w| {
            w.lookups += 1;
        };
        while (self.index < tree.nodes.len) {
            if (testing) if (work) |w| {
                w.comparisons += 1;
            };
            const current = tree.nodes[self.index].record.framing.offset;
            if (current == offset) return self.index;
            if (current > offset) return error.SourceBindingMismatch;
            self.index += 1;
            if (testing) if (work) |w| {
                w.advances += 1;
            };
        }
        return error.SourceBindingMismatch;
    }
};
