//! Ephemeral serializer provenance; never a live table/text cache or edit lease.
const std = @import("std");
pub const Record = struct {
    identity: u64,
    section: usize,
    host_reference: @import("current_paragraph_reference.zig").Reference,
    source_unit: u32,
    current_host: usize,
    current_unit: u32,
    saved_unit: u32,
    table_start: usize = 0,
};
pub const Receipts = struct {
    items: std.ArrayList(Record) = .empty,
    pub fn deinit(self: *Receipts, a: std.mem.Allocator) void {
        self.items.deinit(a);
        self.* = undefined;
    }
};
