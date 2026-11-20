//! Query-only logical parents for the existing selected run/branch visitor.
//! Physical owners, tree nodes, offsets and all editing admission stay unchanged.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Frame = @import("xml_tree_selection.zig").Frame;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Index = struct {
    parents: []?usize,
    wrapper_runs: []?usize,
    invalid_owners: []?usize,
    nodes: usize = 0,
    rewrites: usize = 0,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        a.free(self.parents);
        a.free(self.wrapper_runs);
        a.free(self.invalid_owners);
        self.* = undefined;
    }
    pub fn build(a: std.mem.Allocator, tree: *const Tree, frames: []const Frame, owners: []const ?usize, max_nodes: usize, selected: bool) !Index {
        const count = tree.elements.len;
        if (count == 0 or frames.len != count or owners.len != count) return error.SourceBindingMismatch;
        if (count > max_nodes) return error.LimitExceeded;
        const parents = try a.alloc(?usize, count);
        errdefer a.free(parents);
        const wrappers = try a.alloc(?usize, count);
        errdefer a.free(wrappers);
        const invalid = try a.alloc(?usize, count);
        errdefer a.free(invalid);
        @memset(wrappers, null);
        @memset(invalid, null);
        var result: Index = .{ .parents = parents, .wrapper_runs = wrappers, .invalid_owners = invalid };
        // Tree construction guarantees parent-before-child order. Recheck at
        // this boundary rather than walking ancestor prefixes for every node.
        for (tree.elements, 0..) |element, node| {
            result.nodes += 1;
            const parent = element.parent;
            parents[node] = parent;
            const at = parent orelse continue;
            if (at >= node) return error.InvalidSectionTreeDepth;
            if (!selected or !frames[node].active or frames[at].in_text) continue;
            const effective_run: ?usize = if (wrappers[at]) |wrapper_run| wrapper_run else candidate: {
                if (frames[at].in_text or frames[at].kind != .run or !tree.elements[at].is(uri, "run")) break :candidate null;
                const paragraph = tree.elements[at].parent orelse break :candidate null;
                if (!tree.elements[paragraph].is(uri, "p") or owners[at] != paragraph) break :candidate null;
                break :candidate at;
            };
            const run = effective_run orelse continue;
            const paragraph = tree.elements[run].parent orelse return error.SourceBindingMismatch;
            if (owners[node] != paragraph) {
                // A direct paragraph below a branch is not a new legitimate
                // run child. Valid subList/shape boundaries reset this chain.
                if (wrappers[at] != null) invalid[node] = paragraph;
                continue;
            }
            if (frames[node].kind == .switch_element) {
                // Preserve known conditional object ownership before treating
                // a selected compatibility wrapper as transparent text scope.
                if (@import("run_anchor.zig").knownReadChildKind(tree, node) != null) {
                    if (at != run) {
                        parents[node] = run;
                        result.rewrites += 1;
                    }
                    continue;
                }
                wrappers[node] = run;
            } else if (frames[node].kind == .branch and wrappers[at] != null and frames[at].kind == .switch_element) {
                wrappers[node] = run;
            } else if (wrappers[at] != null) {
                parents[node] = run;
                result.rewrites += 1;
            }
        }
        return result;
    }
};
