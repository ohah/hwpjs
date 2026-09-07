const tree_module = @import("form_property_tree.zig");
const rules = @import("form_schema_rules.zig");
pub const Field = rules.Field;
pub const Report = struct {
    known_nodes: usize = 0,
    deferred_nodes: usize = 0,
    fields: [rules.field_count]?usize = @splat(null),
    pub fn get(self: Report, tree: tree_module.Tree, field: Field) ?@import("form_property.zig").Property {
        return tree.nodes[self.fields[@intFromEnum(field)] orelse return null].property;
    }
};
/// Same unchanged parsed property Tree; unknown subtrees remain in that Tree.
/// Only observed direct paths and kinds are checked. No required/default values.
pub fn inspectObserved(tree: tree_module.Tree, kind: rules.Kind) !Report {
    var report: Report = .{};
    var seen: [@typeInfo(rules.Scope).@"enum".fields.len]bool = @splat(false);
    var root: usize = 0;
    while (root < tree.nodes.len) : (root = tree.nodes[root].subtree_end) {
        const node = tree.nodes[root];
        const scope = rules.scopeFor(kind, node.property.key) orelse {
            report.deferred_nodes += node.subtree_end - root;
            continue;
        };
        if (node.property.kind != .set) return error.FormSchemaTypeMismatch;
        const si = @intFromEnum(scope);
        if (seen[si]) return error.DuplicateFormSchemaSet;
        seen[si] = true;
        report.known_nodes += 1;
        var child = root + 1;
        while (child < node.subtree_end) : (child = tree.nodes[child].subtree_end) {
            const p = tree.nodes[child].property;
            const rule = rules.lookup(kind, scope, p.key) orelse {
                report.deferred_nodes += tree.nodes[child].subtree_end - child;
                continue;
            };
            if (p.kind != rule.kind) return error.FormSchemaTypeMismatch;
            const fi = @intFromEnum(rule.field);
            if (report.fields[fi] != null) return error.DuplicateFormSchemaField;
            report.fields[fi] = child;
            report.known_nodes += 1;
        }
    }
    return report;
}
