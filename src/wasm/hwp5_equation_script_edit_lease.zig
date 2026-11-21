//! One retained Native observation per WASM instance. No witness is transported.
const std = @import("std");
const Witness = @import("../hwp5/edit/equation_script_edit.zig").Witness;
const Ticket = @import("../model/history_mutation_epoch.zig").Ticket;
pub const Frame = struct { session: usize, view_epoch: u64, history_revision: u32 };
pub const Lease = struct { id: u64, before: Witness, frame: Frame };
pub const Store = struct {
    serial: u64 = 0,
    retained: ?Lease = null,
    /// Close/new capture discard authority, but never reuse an old opaque ID.
    pub fn clear(self: *Store) void {
        self.retained = null;
    }
    pub fn retain(self: *Store, before: Witness, frame: Frame) !u64 {
        self.clear();
        const id = std.math.add(u64, self.serial, 1) catch return error.EquationScriptLeaseExhausted;
        self.serial = id;
        self.retained = .{ .id = id, .before = before, .frame = frame };
        return id;
    }
    /// Must run before request parsing, write guards and apply, including no-op.
    pub fn take(self: *Store) ?Lease {
        const value = self.retained;
        self.clear();
        return value;
    }
};
pub fn validate(lease: Lease, id: u64, frame: Frame, ticket: Ticket) !void {
    if (id == 0 or lease.id != id or !std.meta.eql(lease.frame, frame)) return error.StaleEquationScriptLease;
    if (!std.meta.eql(lease.before.binding.binding, ticket.binding)) return error.SourceBindingMismatch;
    if (lease.before.binding.epoch != ticket.epoch) return error.StaleMutationEpoch;
}
