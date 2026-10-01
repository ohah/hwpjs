//! Owned editable values only. Immutable XML/ZIP remain owned by the session.
const std = @import("std");
const editor = @import("editor_session.zig");
const sites_mod = @import("text_sites.zig");
const Dirty = @import("text_sites_save.zig").FieldDirty;
const State = struct {
    sites: sites_mod.Sites,
    dirty: std.ArrayList(Dirty),
    fn deinit(self: *State, a: std.mem.Allocator) void {
        self.sites.deinit(a);
        self.dirty.deinit(a);
    }
};

pub const Checkpoint = struct {
    allocator: std.mem.Allocator,
    source_pointer: [*]const u8,
    source_len: usize,
    states: []State,
    max_bytes: usize,

    pub fn deinit(self: *Checkpoint) void {
        for (self.states) |*state| state.deinit(self.allocator);
        self.allocator.free(self.states);
        self.* = undefined;
    }

    /// Swap is allocation-free and also retains the replaced state for redo.
    /// The originating session must remain alive; a reopened session differs.
    pub fn exchange(self: *Checkpoint, session: *editor.Session) !void {
        if (self.source_pointer != session.source.ptr or self.source_len != session.source.len or self.states.len != session.sections.len or self.allocator.ptr != session.allocator.ptr or self.allocator.vtable != session.allocator.vtable) return error.SourceBindingMismatch;
        _ = try size(session, self.max_bytes);
        for (self.states, session.sections) |*state, *section| {
            std.mem.swap(sites_mod.Sites, &state.sites, &section.sites);
            std.mem.swap(std.ArrayList(Dirty), &state.dirty, &section.field_dirty);
        }
    }
};

pub fn capture(session: *const editor.Session, max_bytes: usize) !Checkpoint {
    _ = try size(session, max_bytes);
    const a = session.allocator;
    const states = try a.alloc(State, session.sections.len);
    var initialized: usize = 0;
    errdefer {
        for (states[0..initialized]) |*state| state.deinit(a);
        a.free(states);
    }
    for (session.sections, states) |section, *state| {
        var sites = try section.sites.clone(a);
        errdefer sites.deinit(a);
        const dirty = try a.dupe(Dirty, section.field_dirty.items);
        state.* = .{ .sites = sites, .dirty = .{ .items = dirty, .capacity = dirty.len } };
        initialized += 1;
    }
    return .{ .allocator = a, .source_pointer = session.source.ptr, .source_len = session.source.len, .states = states, .max_bytes = max_bytes };
}

pub fn size(session: *const editor.Session, limit: usize) !usize {
    var total: usize = 0;
    try add(&total, try multiply(session.sections.len, @sizeOf(State)), limit);
    for (session.sections) |section| {
        try add(&total, try multiply(section.sites.items.len, @sizeOf(sites_mod.Site)), limit);
        // Capacity accounts for buffers transferred into the checkpoint.
        try add(&total, try multiply(section.field_dirty.capacity, @sizeOf(Dirty)), limit);
        for (section.sites.items) |site| try add(&total, site.text.len, limit);
    }
    return total;
}
fn multiply(left: usize, right: usize) !usize {
    return std.math.mul(usize, left, right) catch error.LimitExceeded;
}
fn add(total: *usize, amount: usize, limit: usize) !void {
    if (amount > limit -| total.*) return error.LimitExceeded;
    total.* += amount;
}
