const std = @import("std");
const Tree = @import("tree.zig").Tree;
const form = @import("form_control.zig");
const control = @import("control_links.zig");
const rules = @import("control_rules.zig");
pub const observed_code: u16 = 11;
pub const Report = struct {
    forms: form.Report,
    /// Same order as forms.forms, not paragraph traversal order.
    links: []control.Link,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.links);
        self.forms.deinit(a);
        self.* = undefined;
    }
};
/// Explicit observed form interpretation. Validates token/header pairing for the
/// entire unchanged Tree; does not validate other control types or payloads.
/// Owns result arrays, but form payloads still borrow the original Section.
pub fn collectObservedUnits(a: std.mem.Allocator, tree: Tree, options: form.Options) !Report {
    var forms = try form.collectObservedUnits(a, tree, options);
    errdefer forms.deinit(a);
    var all = try control.Links.build(a, tree);
    defer all.deinit(a);
    const links = try a.alloc(control.Link, forms.forms.len);
    errdefer a.free(links);
    var found: usize = 0;
    for (all.items) |link| {
        if (link.header_id != rules.form_id) continue;
        if (link.code != observed_code) return error.FormControlCodeMismatch;
        // Forms are in node order; Links.build groups by paragraph and can emit
        // an outer sibling before a nested form. Do not merge these as sorted lists.
        var low: usize = 0;
        var high = forms.forms.len;
        while (low < high) {
            const middle = low + (high - low) / 2;
            if (forms.forms[middle].control_node < link.control_node) low = middle + 1 else high = middle;
        }
        if (low == forms.forms.len or forms.forms[low].control_node != link.control_node) return error.MissingFormControl;
        // Links.build emits exactly one link per header from this same Tree.
        links[low] = link;
        found += 1;
    }
    if (found != links.len) return error.MissingFormControlLink;
    return .{ .forms = forms, .links = links };
}
