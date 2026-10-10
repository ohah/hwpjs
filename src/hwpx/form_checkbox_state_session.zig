//! Session target selection and authoritative scalar delegation.
const editor = @import("editor_session.zig");
const values = @import("form_checkbox_state_values.zig");
pub const State = @import("form_checkbox_state_write.zig").State;
fn validate(session: *const editor.Session, section: usize, node: usize) !void {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    if (node >= tree.elements.len) return error.InvalidFormNode;
    const options = editor.siteOptions(session.options);
    const frames = try @import("xml_tree_selection.zig").build(session.allocator, tree, options.branch_policy, options.max_attribute_bytes);
    defer session.allocator.free(frames);
    if (!frames[node].active) return error.InactiveFormNode;
}
pub fn read(session: *const editor.Session, section: usize, node: usize) !State {
    try validate(session, section, node);
    const part = &session.sections[section];
    return values.read(session.allocator, &part.tree, &part.checkbox_states, node);
}
pub fn set(session: *editor.Session, section: usize, node: usize, state: State) !bool {
    try validate(session, section, node);
    const part = &session.sections[section];
    return values.set(session.allocator, &part.tree, &part.checkbox_states, node, state, session.options.max_xml_bytes);
}
