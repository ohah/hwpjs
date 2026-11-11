//! Native form current reads and one prepared radio/text transaction.
const std = @import("std");
const editor = @import("editor_session.zig");
const choices = @import("form_checkbox_state_values.zig");
const attrs = @import("form_attribute_values.zig");
pub fn validate(s: *const editor.Session, section: usize, node: usize) !void {
    if (section >= s.sections.len) return error.InvalidSectionIndex;
    const tree = &s.sections[section].tree;
    if (node >= tree.elements.len) return error.InvalidFormNode;
    try s.sections[section].validateSourceBasis();
    const frames = try @import("xml_tree_selection.zig").build(s.allocator, tree, editor.siteOptions(s.options).branch_policy, 65536);
    defer s.allocator.free(frames);
    if (!frames[node].active or frames[node].in_text) return error.InactiveFormNode;
    _ = try @import("paragraph_site_owner.zig").ancestor(tree, node);
}
pub fn radioState(s: *const editor.Session, section: usize, node: usize) !attrs.ButtonState {
    try validate(s, section, node);
    const part = &s.sections[section];
    return choices.readRadio(s.allocator, &part.tree, &part.checkbox_states, node);
}
pub fn text(s: *const editor.Session, section: usize, node: usize) ![]u8 {
    try validate(s, section, node);
    const part = &s.sections[section];
    return part.form_texts.read(s.allocator, &part.tree, node, s.options.max_text_bytes);
}
pub fn setText(s: *editor.Session, section: usize, node: usize, value: []const u8) !bool {
    try validate(s, section, node);
    const a = s.allocator;
    const part = &s.sections[section];
    var candidate_values = try part.form_texts.clone(a);
    defer candidate_values.deinit(a);
    if (!try candidate_values.set(a, &part.tree, node, value, s.options.max_xml_bytes, s.options.max_text_bytes)) return false;
    const sections = try a.dupe(editor.Section, s.sections);
    defer a.free(sections);
    sections[section].form_texts = candidate_values;
    var candidate = s.*;
    candidate.sections = sections;
    const saved = try candidate.save();
    defer a.free(saved);
    std.mem.swap(@import("form_text_values.zig").Values, &part.form_texts, &candidate_values);
    return true;
}
pub fn selectRadio(s: *editor.Session, section: usize, node: usize) !bool {
    try validate(s, section, node);
    const a = s.allocator;
    var selected = try attrs.read(a, &s.sections[section].tree, node, .{});
    defer selected.deinit(a);
    if (selected.kind != .radio_button) return error.NotRadioForm;
    const group = selected.string(.radioGroupName) orelse return error.MissingRadioGroupName;
    const Draft = struct { section: usize, values: choices.Values };
    var drafts: std.ArrayList(Draft) = .empty;
    defer {
        for (drafts.items) |*draft| draft.values.deinit(a);
        drafts.deinit(a);
    }
    var group_count: usize = 0;
    var changed = false;
    for (s.sections, 0..) |*part, si| {
        try part.validateSourceBasis();
        const frames = try @import("xml_tree_selection.zig").build(a, &part.tree, editor.siteOptions(s.options).branch_policy, 65536);
        defer a.free(frames);
        var draft: ?usize = null;
        for (part.tree.elements, 0..) |_, index| {
            if (@import("run_anchor.zig").kind(&part.tree, index) != .radio_button or !frames[index].active or frames[index].in_text) continue;
            var member = try attrs.read(a, &part.tree, index, .{});
            defer member.deinit(a);
            const name = member.string(.radioGroupName) orelse return error.MissingRadioGroupName;
            if (!std.mem.eql(u8, group, name)) continue;
            group_count += 1;
            if (group.len == 0 and (si != section or index != node)) return error.AmbiguousUnnamedRadioGroup;
            _ = try @import("paragraph_site_owner.zig").ancestor(&part.tree, index);
            const current = try choices.readRadio(a, &part.tree, &part.checkbox_states, index);
            const desired: attrs.ButtonState = if (si == section and index == node) .checked else .unchecked;
            if (current == desired) continue;
            if (draft == null) {
                var copy: choices.Values = .empty;
                try copy.appendSlice(a, part.checkbox_states.items);
                errdefer copy.deinit(a);
                try drafts.append(a, .{ .section = si, .values = copy });
                draft = drafts.items.len - 1;
            }
            changed = (try choices.setRadio(a, &part.tree, &drafts.items[draft.?].values, index, desired, s.options.max_xml_bytes)) or changed;
        }
    }
    if (group_count == 0) return error.MissingRadioGroupName;
    // Validate selected permissions even on a no-op, without touching its state.
    const checked = try @import("form_checkbox_state_write.zig").writeRadio(a, &s.sections[section].tree, node, .checked, s.options.max_xml_bytes);
    a.free(checked);
    if (!changed) return false;
    const sections = try a.dupe(editor.Section, s.sections);
    defer a.free(sections);
    for (drafts.items) |draft| sections[draft.section].checkbox_states = draft.values;
    var candidate = s.*;
    candidate.sections = sections;
    const saved = try candidate.save();
    defer a.free(saved);
    for (drafts.items) |*draft| std.mem.swap(choices.Values, &s.sections[draft.section].checkbox_states, &draft.values);
    return true;
}
