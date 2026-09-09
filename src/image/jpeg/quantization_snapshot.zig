const Table = @import("quantization.zig").Table;

/// Owned wire representation, retaining precision and destination. A view
/// borrows this snapshot and must not outlive or move away from its owner.
pub const Snapshot = struct {
    destination: u8,
    precision: u8,
    raw: [128]u8 = @splat(0),

    pub fn from(table: Table) Snapshot {
        var result: Snapshot = .{ .destination = table.destination, .precision = table.precision };
        @memcpy(result.raw[0..table.raw.len], table.raw);
        return result;
    }

    pub fn view(self: *const Snapshot) Table {
        return .{ .destination = self.destination, .precision = self.precision, .raw = self.raw[0..@as(usize, if (self.precision == 0) 64 else 128)] };
    }
};
