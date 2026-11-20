//! Atomic admitted package deletion, published only by the common document Edge.
//! Explicit continuous numbering uses observed deletion and sequence update rules.
//! Restart/page numbering and creation remain open work.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const owners = @import("note_delete_owner.zig");
pub const Request = owners.Request;
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: Request, options: editor.Options) !editor.Session {
    var doc = try @import("package.zig").inspectDocument(a, before, .{});
    defer doc.deinit(a);
    const security = @import("file_transform_security.zig");
    try security.validate(a, &doc, options.max_xml_bytes);
    var current = try editor.open(a, before, options);
    defer current.deinit();
    if (current.original_header) |*header| try security.validateTree(header);
    for (current.sections) |section| try security.validateTree(&section.tree);
    const resolved = try owners.resolveSaved(a, &current, request);
    try @import("note_delete_policy.zig").validate(a, &current, if (request.kind == .foot) .foot else .end);
    // The writer owns one grouped plan: marker/body removal plus continuous
    // following-number updates and only the actual affected paragraph caches.
    const bytes = try @import("note_delete_write.zig").package(a, &current, before, resolved);
    defer a.free(bytes);
    var candidate = try editor.open(a, bytes, options);
    errdefer candidate.deinit();
    // Reopen and independently count matching marker families. No stale source
    // index, XML id, lease or reader cache is transferred to the new package.
    var old_count: usize = 0;
    var new_count: usize = 0;
    const uri = @import("document_xml.zig").paragraph_uri;
    const tag = if (request.kind == .foot) "footNote" else "endNote";
    for (current.sections) |part| for (part.tree.elements) |element| {
        if (element.is(uri, tag)) old_count += 1;
    };
    for (candidate.sections) |part| for (part.tree.elements) |element| {
        if (element.is(uri, tag)) new_count += 1;
    };
    if (old_count != new_count + 1) return error.InvalidNoteDeleteResult;
    return candidate;
}
