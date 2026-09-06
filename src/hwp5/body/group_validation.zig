const Tree = @import("tree.zig").Tree;
const component = @import("shape_component.zig");
const info = @import("group_info.zig");
pub const Report = struct {
    groups: usize = 0,
    children: usize = 0,
    empty_groups: usize = 0,
    extra_bytes: usize = 0,
    /// Component and its ID/Rendering layout were already parsed by shape_validation.
    pub fn add(self: *Report, tree: Tree, index: usize, p: component.Component) !void {
        if (p.id != @import("control_rules.zig").id("$con")) return;
        const list = try info.Info.parse(p.extra, .ids_only);
        var ordinal: usize = 0;
        var identity_mismatch = false;
        var child = index + 1;
        while (child < tree.nodes[index].subtree_end) : (child = tree.nodes[child].subtree_end) {
            const r = tree.nodes[child].record.framing;
            if (r.tag != component.tag) continue;
            const expected = list.ids.get(ordinal) orelse return error.GroupChildCountMismatch;
            if (try component.identity(r.payload) != expected.id) identity_mismatch = true;
            ordinal += 1;
        }
        if (ordinal != list.ids.count()) return error.GroupChildCountMismatch;
        if (identity_mismatch) return error.GroupChildIdentityMismatch;
        self.groups += 1;
        self.children += ordinal;
        self.empty_groups += @intFromBool(ordinal == 0);
        self.extra_bytes += list.extra.len;
    }
};
