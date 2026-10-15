const std = @import("std");
const editor = @import("editor_session.zig");
const host = @import("picture_display_host.zig");

pub const Owner = struct { paragraph: usize, anchor_node: usize, anchor_unit: usize };
pub const Result = union(enum) { owner: Owner, failure: anyerror };
pub const max_pictures = 100000;

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, picture: usize) !Owner {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    return readCurrent(a, section, current.paragraphs, picture);
}

/// One temporary current view for all requested pictures, not a session cache.
/// Policy errors stay local to the picture; allocation failures abort the batch.
pub fn readMany(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, pictures: []const usize) ![]Result {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (pictures.len > max_pictures) return error.LimitExceeded;
    if (pictures.len == 0) return a.alloc(Result, 0);
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const results = try a.alloc(Result, pictures.len);
    errdefer a.free(results);
    for (pictures, results) |picture, *result| {
        const owner = readCurrent(a, section, current.paragraphs, picture) catch |err| {
            if (err == error.OutOfMemory) return err;
            result.* = .{ .failure = err };
            continue;
        };
        result.* = .{ .owner = owner };
    }
    return results;
}

fn readCurrent(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph, picture: usize) !Owner {
    const ordinal = try host.currentOrdinal(&section.tree, paragraphs, section.first_paragraph, picture);
    const anchor = try host.owningAnchor(a, &section.tree, &paragraphs[ordinal - section.first_paragraph], picture);
    return .{ .paragraph = ordinal, .anchor_node = anchor.source_node, .anchor_unit = anchor.unit };
}
