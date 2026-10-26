//! Form text is an owned model intent; prepare and validate before committing.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Edit = struct { section: usize, form_node: u32, text: []const u8 };
const Context = struct {
    source: []const u8,
    version: @import("../version.zig").Version,
    form_node: u32,
    text: []const u8,
    limit: usize,
    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        try @import("source_policy.zig").validateFieldTransaction(a, self.source, self.version);
        var tree = try @import("source_tree.zig").parse(a, self.source, self.version, .{});
        defer tree.deinit(a);
        var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
        defer forms.deinit(a);
        var selected: ?usize = null;
        for (forms.forms.forms, 0..) |form, index| if (form.object_node == self.form_node) {
            if (selected != null) return error.SourceBindingMismatch;
            selected = index;
        };
        const index = selected orelse return error.InvalidFormTextTarget;
        const form = forms.forms.forms[index];
        const kind = form.envelope.kind();
        if (kind != .edit and kind != .combo_box) return error.UnsupportedFormTextKind;
        var owners = try @import("current_paragraph_sources.zig").build(a, draft.paragraphs);
        defer owners.deinit(a);
        const paragraph = owners.get(@intCast(forms.links[index].paragraph_node)) orelse return error.MissingCurrentFormOwner;
        _ = try @import("current_control_anchor.zig").position(forms.links, index, draft.paragraphs[paragraph]);
        const report = try @import("../body/form_schema.zig").inspectObserved(form.properties, kind);
        const flag = @import("../body/form_semantics.zig").flagObserved;
        if (flag(form.properties, report, .enabled) != .on or flag(form.properties, report, .editable) != .on) return error.FormTextNotEditable;
        if (kind == .combo_box and flag(form.properties, report, .edit_enable) != .on) return error.FormTextNotEditable;
        if (kind == .edit) {
            if (flag(form.properties, report, .read_only) != .off) return error.FormTextNotEditable;
            if (flag(form.properties, report, .number) != .off) return error.UnsupportedFormTextMode;
            const maximum = @import("../body/form_max_length.zig").inspectObserved(form.properties, report, kind);
            switch (maximum.state) {
                .unlimited => {},
                .nonnegative => if (maximum.compareCount(@intCast(self.text.len / 2)).? == .gt) return error.FormTextLengthExceeded,
                else => return error.UnsupportedFormTextLimit,
            }
        }
        // These layout flags are not edit permissions. Preserve their exact
        // source values; save still requires explicit stale-layout consent.
        // Canvas may refuse modes whose geometry it cannot yet reproduce.
        const original = report.get(form.properties, .text) orelse return error.MissingFormProperty;
        try @import("../../model/form_values.zig").upsert(a, &draft.form_values, self.form_node, self.text, original.value, self.limit);
        const candidate = try @import("form_current_section.zig").writeAll(a, self.source, self.version, draft.form_values orelse &.{}, self.limit);
        defer a.free(candidate);
    }
};
pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, edit: Edit, limit: usize) !void {
    if (edit.text.len > 196605) return error.LimitExceeded;
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, edit.text);
    defer a.free(units);
    if (units.len > 65535) return error.LimitExceeded;
    const context: Context = .{ .source = source, .version = version, .form_node = edit.form_node, .text = std.mem.sliceAsBytes(units), .limit = limit };
    try @import("../../model/transaction.zig").apply(a, section, context, Context.prepare);
}
