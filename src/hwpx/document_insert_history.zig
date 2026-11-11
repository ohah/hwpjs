//! An insertion changes the immutable package basis, including the header.
//! Park exactly one side of that edge while the other side is the live Session.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoints = @import("editor_checkpoint.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub const Edge = struct {
    allocator: std.mem.Allocator,
    parked: editor.Session,
    parked_text_bytes: usize,
    left: [*]const u8,
    right: [*]const u8,

    pub fn destroy(self: *Edge) void {
        const a = self.allocator;
        self.parked.deinit();
        a.destroy(self);
    }

    pub fn validate(self: *const Edge, live: *const editor.Session, redo: bool, payload_limit: usize) !void {
        if (live.source.ptr != (if (redo) self.left else self.right) or
            self.parked.source.ptr != (if (redo) self.right else self.left))
            return error.SourceBindingMismatch;
        try validateParkable(live, payload_limit);
    }

    pub fn exchange(self: *Edge, live: *editor.Session, text_bytes: *usize) void {
        live.invalidateSectionSourceCaches();
        for (live.sections) |*section| {
            std.debug.assert(section.sites.delta_buffers.count() == 0);
            section.sites.delta_buffers.deinit(live.allocator);
        }
        const serial = live.mutation_serial;
        live.history_transaction_active = false;
        std.mem.swap(editor.Session, live, &self.parked);
        std.mem.swap(usize, text_bytes, &self.parked_text_bytes);
        live.mutation_serial = serial;
        live.history_transaction_active = true;
    }
};

fn sum(total: *usize, bytes: usize) !void {
    total.* = std.math.add(usize, total.*, bytes) catch return error.HistoryEntryOwnedLimitExceeded;
}

fn treeCost(tree: *const Tree) !usize {
    var total = tree.source.len;
    try sum(&total, try product(tree.elements.len, @sizeOf(TreeElement)));
    try sum(&total, try product(tree.uris.len, @sizeOf([]u8)));
    for (tree.uris) |uri| try sum(&total, uri.len);
    return total;
}

const TreeElement = @import("xml_part_tree.zig").Element;
fn product(count: usize, size: usize) !usize {
    return std.math.mul(usize, count, size) catch error.HistoryEntryOwnedLimitExceeded;
}

fn immutableCost(session: *const editor.Session) !usize {
    var total = session.source.len;
    try sum(&total, try product(session.sections.len, @sizeOf(editor.Section)));
    if (session.original_header) |*header| try sum(&total, try treeCost(header));
    for (session.sections) |*section| {
        const basis = section.original_basis orelse return error.SourceBindingMismatch;
        try sum(&total, @sizeOf(@TypeOf(basis.*)));
        try sum(&total, try basis.byteSize(std.math.maxInt(usize)));
    }
    return total;
}

/// Checkpoint sizing covers editable ownership after suffix buffers are
/// normalized. Immutable package, header, section bases and arrays are extra.
/// Derived source caches are discarded on parking and are never retained.
pub fn reservation(left: *const editor.Session, right: *const editor.Session, payload_limit: usize) !usize {
    var result = @max(try immutableCost(left), try immutableCost(right));
    try sum(&result, payload_limit);
    return result;
}

pub fn validateParkable(session: *const editor.Session, payload_limit: usize) !void {
    if (session.header_read_context != null or session.formatting_batch != null)
        return error.ReadObservationScopeActive;
    for (session.sections) |section| {
        if (section.paragraph_query_cache != null) return error.ReadObservationScopeActive;
        if (section.structure_values) |values| for (values.paragraphs) |paragraph| {
            if (paragraph.sites.delta_buffers.storage != null) return error.HistorySourceOwnershipUncertain;
        };
    }
    _ = try checkpoints.size(session, payload_limit);
}
