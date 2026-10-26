//! Current paragraph identity and scalar/control point, not insertion admission.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Host = union(enum) { original_node: u32, generated_instance: u32 };
pub const Anchor = struct { host: Host, unit: u32 };

fn boundary(a: std.mem.Allocator, paragraph: model.Paragraph, unit: u32) !void {
    for (paragraph.tokens) |token| if (token.encoding != .utf16le) return error.SourceBindingMismatch;
    const bytes = try @import("plain_text_content.zig").editableTextBytes(a, paragraph);
    defer a.free(bytes);
    try @import("control_boundaries.zig").validateRetainedText(bytes);
    try @import("control_boundaries.zig").validate(bytes, unit, unit);
}

pub fn identity(p: model.Paragraph) !Host {
    return if (p.source_node != null)
        .{ .original_node = try p.originalNode() }
    else generated: {
        if (p.instance_id == 0 or p.header_template == null) return error.SourceBindingMismatch;
        break :generated .{ .generated_instance = p.instance_id };
    };
}

pub fn capture(a: std.mem.Allocator, section: *const model.Section, index: usize, unit: u32) !Anchor {
    if (index >= section.paragraphs.len) return error.InvalidParagraph;
    const anchor: Anchor = .{ .host = try identity(section.paragraphs[index]), .unit = unit };
    if (try resolve(a, section, anchor) != index) return error.SourceBindingMismatch;
    return anchor;
}

pub fn resolve(a: std.mem.Allocator, section: *const model.Section, anchor: Anchor) !usize {
    var found: ?usize = null;
    switch (anchor.host) {
        .generated_instance => |id| if (id == 0) return error.SourceBindingMismatch,
        .original_node => {},
    }
    for (section.paragraphs, 0..) |p, index| {
        const matches = switch (anchor.host) {
            .original_node => |node| p.source_node != null and p.source_node.? == node,
            .generated_instance => |id| p.instance_id == id,
        };
        if (!matches) continue;
        if (found != null) return error.SourceBindingMismatch;
        switch (anchor.host) {
            .original_node => if (try p.originalNode() >= section.source_record_count) return error.SourceBindingMismatch,
            .generated_instance => {
                if (p.source_node != null) return error.SourceBindingMismatch;
                const template = p.header_template orelse return error.SourceBindingMismatch;
                if (template >= section.source_record_count) return error.SourceBindingMismatch;
            },
        }
        found = index;
    }
    const index = found orelse return error.MissingParagraphSource;
    try boundary(a, section.paragraphs[index], anchor.unit);
    return index;
}
