//! Owned admitted editor values. A portable witness is not a private JS authority token.
const std = @import("std");
const request = @import("literal_edit_request.zig");
pub const Lease = struct {
    binding: @import("../../model/history_mutation_epoch.zig").Ticket,
    target: request.Target,
    source_xml_sha256: [32]u8,
    context: @import("literal_edit_context.zig").Prepared,
    pub fn deinit(self: *Lease, a: std.mem.Allocator) void {
        self.context.deinit(a);
        self.* = undefined;
    }
};
