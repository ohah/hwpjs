//! Source-validated retention scope for a section containing unclosed click fields.
//! A plan is not edit admission; callers must still validate and commit atomically.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const headers = @import("field_header_source.zig");
const ownership = @import("paragraph_owner.zig");
const root_owner = std.math.maxInt(usize);
pub const Plan = struct {
    protected_paragraphs: []bool,
    bound_headers: usize,

    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.protected_paragraphs);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, source: []const u8, version: Version, section: model.Section) !Plan {
    try @import("source_policy.zig").validateFieldTextTransaction(a, source, version);
    var topology = try @import("local_field_spans.zig").inspectReadableBound(a, source, version, section);
    defer topology.deinit(a);
    if (topology.unresolved.len == 0) return error.UnsupportedCrossParagraphField;
    const click = @import("../body/control_rules.zig").id("%clk");
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try ownership.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const counts = try a.alloc(usize, section.paragraphs.len);
    defer a.free(counts);
    @memset(counts, 0);
    const owners = try a.alloc(usize, section.paragraphs.len);
    defer a.free(owners);
    for (section.paragraphs, owners) |paragraph, *owner| {
        if (paragraph.source_node == null) return error.UnsupportedStructuralControl;
        owner.* = (try ownership.logicalOwner(tree, groups, try paragraph.originalNode())) orelse root_owner;
    }
    const protected = try a.alloc(bool, section.paragraphs.len);
    errdefer a.free(protected);
    @memset(protected, false);
    var seen: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer seen.deinit(a);
    for (topology.spans) |span| {
        if (span.field_id != click) return error.UnsupportedCrossParagraphField;
        const header = try headers.read(tree, try section.paragraphs[span.begin.paragraph].originalNode(), span.ordinal, click, false);
        const entry = try seen.getOrPut(a, header.source_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        counts[span.begin.paragraph] += 1;
        const owner = owners[span.begin.paragraph];
        if (owners[span.end.paragraph] != owner) return error.SourceBindingMismatch;
        for (span.begin.paragraph..span.end.paragraph + 1) |paragraph| {
            if (owners[paragraph] == owner) protected[paragraph] = true;
        }
    }
    for (topology.unresolved) |marker| {
        if (marker.kind != .unclosed_start or marker.marker_id != click) return error.UnsupportedCrossParagraphField;
        const paragraph = marker.position.paragraph;
        const ordinal = marker.ordinal orelse return error.SourceBindingMismatch;
        if (owners[paragraph] != (marker.list_node orelse root_owner)) return error.SourceBindingMismatch;
        const header = try headers.read(tree, try section.paragraphs[paragraph].originalNode(), ordinal, click, false);
        const entry = try seen.getOrPut(a, header.source_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        counts[paragraph] += 1;
        // Unknown closure protects the whole source list, not an invented span.
        for (owners, 0..) |owner, index| if (owner == owners[paragraph]) {
            protected[index] = true;
        };
    }
    for (section.paragraphs, counts) |paragraph, expected| {
        if (try headers.count(tree, try paragraph.originalNode()) != expected) return error.SourceBindingMismatch;
    }
    return .{ .protected_paragraphs = protected, .bound_headers = seen.count() };
}
