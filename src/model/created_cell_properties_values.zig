//! Unpublished generated-cell property intents. Identity is never a source node.
//! Format adapters must serialize/COW resources before one History publication.
const std = @import("std");
const Table = @import("created_table.zig").Table;
const Ticket = @import("history_mutation_epoch.zig").Ticket;
const style = @import("border_fill_patch.zig");
pub const Address = struct { section: usize, identity: u64, row: u32, column: u32 };
pub const Frame = struct { width: u32, height: u32 };
pub const Size = struct { width: ?u32 = null, height: ?u32 = null };
pub const Request = struct {
    address: Address,
    expected_ticket: Ticket,
    expected: Frame,
    vertical_alignment: ?@import("cell_vertical_alignment.zig").Alignment = null,
    size: Size = .{},
    appearance: style.Patch = .{},
};
pub const Entry = struct { address: Address, frame: Frame, appearance: style.Patch, vertical_alignment: ?@import("cell_vertical_alignment.zig").Alignment = null };
pub const Values = struct {
    entries: []Entry = &.{},
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.entries);
        self.* = undefined;
    }
    pub fn clone(self: Values, a: std.mem.Allocator) !Values {
        return .{ .entries = try a.dupe(Entry, self.entries) };
    }
    pub fn observe(self: Values, table: *const Table, address: Address) !Entry {
        if (address.identity == 0 or table.identity != address.identity) return error.InvalidCreatedTableIdentity;
        const base = try table.plan.cell(address.row, address.column);
        if (table.cells.len != try std.math.mul(usize, table.plan.rows, table.plan.columns)) return error.InvalidTableCell;
        var selected: ?Entry = null;
        for (self.entries) |entry| if (std.meta.eql(entry.address, address)) {
            if (selected != null) return error.SourceBindingMismatch;
            selected = entry;
        };
        return selected orelse .{ .address = address, .frame = .{ .width = base.width, .height = base.height }, .appearance = .{} };
    }
};
pub const Prepared = struct {
    values: Values,
    changed: bool,
    ticket: Ticket,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.values.deinit(a);
        self.* = undefined;
    }
    pub fn revalidate(self: Prepared, current: Ticket) !void {
        if (!std.meta.eql(self.ticket.binding, current.binding)) return error.SourceBindingMismatch;
        if (self.ticket.epoch != current.epoch) return error.StaleMutationEpoch;
    }
};
/// Pure native preparation. Does not edit source tables or publish resources.
/// Full document-wide unique identity/protected-host admission remains the adapter's duty.
pub fn prepare(a: std.mem.Allocator, before: Values, table: *const Table, section: usize, current: Ticket, request: Request, max_bytes: usize) !Prepared {
    return prepareWithAlignmentBase(a, before, table, section, current, request, max_bytes, null);
}

/// Base is supplied by the format owner, not inferred from an absent override.
pub fn prepareWithAlignmentBase(a: std.mem.Allocator, before: Values, table: *const Table, section: usize, current: Ticket, request: Request, max_bytes: usize, alignment_base: ?@import("cell_vertical_alignment.zig").Alignment) !Prepared {
    if (!std.meta.eql(current.binding, request.expected_ticket.binding)) return error.SourceBindingMismatch;
    if (current.epoch != request.expected_ticket.epoch) return error.StaleMutationEpoch;
    if (section != request.address.section) return error.InvalidSection;
    const old = try before.observe(table, request.address);
    if (!std.meta.eql(old.frame, request.expected)) return error.StaleCreatedCellProperties;
    if (request.vertical_alignment == null and request.size.width == null and request.size.height == null and !style.has(request.appearance)) return error.EmptyCreatedCellProperties;
    const frame: Frame = .{ .width = request.size.width orelse old.frame.width, .height = request.size.height orelse old.frame.height };
    if (frame.width == 0 or frame.height == 0) return error.InvalidCreatedCellPropertiesSize;
    try style.validate(request.appearance);
    const appearance = style.merge(old.appearance, request.appearance);
    var alignment = old.vertical_alignment;
    if (request.vertical_alignment) |desired| {
        const effective = old.vertical_alignment orelse alignment_base orelse return error.UnsupportedCreatedCellVerticalAlignment;
        if (effective != desired) {
            alignment = if (alignment_base != null and alignment_base.? == desired) null else desired;
        }
    }
    const edited: Entry = .{ .address = request.address, .frame = frame, .appearance = appearance, .vertical_alignment = alignment };
    var index: ?usize = null;
    for (before.entries, 0..) |entry, i| if (std.meta.eql(entry.address, request.address)) {
        index = i;
    };
    const changed = !std.meta.eql(old, edited);
    const count = std.math.add(usize, before.entries.len, @intFromBool(changed and index == null)) catch return error.LimitExceeded;
    const bytes = std.math.mul(usize, count, @sizeOf(Entry)) catch return error.LimitExceeded;
    if (bytes > max_bytes) return error.LimitExceeded;
    const entries = try a.alloc(Entry, count);
    @memcpy(entries[0..before.entries.len], before.entries);
    if (changed) entries[index orelse before.entries.len] = edited;
    return .{ .values = .{ .entries = entries }, .changed = changed, .ticket = current };
}
