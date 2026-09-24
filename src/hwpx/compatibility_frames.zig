const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const selection = @import("compatibility_selection.zig");

pub const Kind = enum { other, run, switch_element, branch };
pub const Frame = struct {
    kind: Kind = .other,
    active: bool = true,
    selected: selection.State = .{},
};

/// Advances a streaming hp:run/switch/case|default stack. The caller owns
/// the root and any part-specific scope, and stores returned start frames.
pub fn enter(a: std.mem.Allocator, frames: []Frame, depth: usize, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, policy: selection.Policy) !Frame {
    if (depth < 2 or depth > frames.len) return error.LimitExceeded;
    const parent = frames[depth - 2];
    var frame: Frame = .{ .active = parent.active };
    if (parent.active) {
        const is_case = if (parent.kind == .switch_element) try attrs.element(tag, scope, document_xml.paragraph_uri, "case") else false;
        const is_default = if (parent.kind == .switch_element and !is_case) try attrs.element(tag, scope, document_xml.paragraph_uri, "default") else false;
        if (is_case or is_default) {
            frame.kind = .branch;
            frame.active = try selection.choose(a, tag, scope, is_case, max_attribute_bytes, policy, &frames[depth - 2].selected);
        } else if ((parent.kind == .run or parent.kind == .branch) and try attrs.element(tag, scope, document_xml.paragraph_uri, "switch")) {
            frame.kind = .switch_element;
        }
    }
    if (frame.active and try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) frame.kind = .run;
    return frame;
}
