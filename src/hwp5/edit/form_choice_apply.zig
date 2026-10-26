//! Checkbox value transaction; raw payloads remain immutable.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Edit = struct { section: usize, form_node: u32, state: u8 };
const Context = struct {
    source: []const u8,
    version: @import("../version.zig").Version,
    edit: Edit,
    limit: usize,
    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        try @import("source_policy.zig").validateFieldTransaction(a, self.source, self.version);
        var tree = try @import("source_tree.zig").parse(a, self.source, self.version, .{});
        defer tree.deinit(a);
        var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
        defer forms.deinit(a);
        var selected: ?usize = null;
        for (forms.forms.forms, 0..) |form, index| if (form.object_node == self.edit.form_node) {
            if (selected != null) return error.SourceBindingMismatch;
            selected = index;
        };
        const index = selected orelse return error.InvalidFormChoiceTarget;
        const form = forms.forms.forms[index];
        if (form.envelope.kind() != .check_box) return error.UnsupportedFormChoiceKind;
        var owners = try @import("current_paragraph_sources.zig").build(a, draft.paragraphs);
        defer owners.deinit(a);
        const paragraph = owners.get(@intCast(forms.links[index].paragraph_node)) orelse return error.MissingCurrentFormOwner;
        _ = try @import("current_control_anchor.zig").position(forms.links, index, draft.paragraphs[paragraph]);
        const report = try @import("../body/form_schema.zig").inspectObserved(form.properties, .check_box);
        const semantics = @import("../body/form_semantics.zig");
        if (semantics.flagObserved(form.properties, report, .enabled) != .on or semantics.flagObserved(form.properties, report, .editable) != .on) return error.FormChoiceNotEditable;
        const observed = semantics.inspectObserved(form.properties, report, .check_box, .absent);
        if (observed.choice == .invalid or observed.choice == .deferred) return error.UnsupportedFormChoiceValue;
        if (self.edit.state == 2 and observed.tri_state != .on) return error.FormTriStateRequired;
        const original = report.get(form.properties, .value) orelse return error.MissingFormProperty;
        const old_state: u8 = switch (observed.choice) {
            .unchecked => 0,
            .checked => 1,
            .indeterminate => 2,
            else => return error.UnsupportedFormChoiceValue,
        };
        const value = [_]u8{ '0' + self.edit.state, 0 };
        // Reset to exact original spelling rather than canonicalizing e.g. 000.
        const bytes: []const u8 = if (old_state == self.edit.state) original.value else &value;
        try @import("../../model/form_values.zig").upsertField(a, &draft.form_values, self.edit.form_node, .value, bytes, original.value, self.limit);
        const candidate = try @import("form_current_section.zig").writeAll(a, self.source, self.version, draft.form_values orelse &.{}, self.limit);
        defer a.free(candidate);
    }
};
pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, edit: Edit, limit: usize) !void {
    if (edit.state > 2) return error.InvalidFormChoiceState;
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .edit = edit, .limit = limit }, Context.prepare);
}
