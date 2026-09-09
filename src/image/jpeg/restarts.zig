const fields = @import("scan_fields.zig");

/// Marker numbering only; Ri-to-MCU distances require entropy decoding.
pub const State = struct {
    interval: u16 = 0,
    next: u3 = 0,
    count: usize = 0,
    in_scan: bool = false,

    pub fn define(self: *State, payload: []const u8) !void {
        if (self.in_scan) return error.InvalidJpegRestartPosition;
        self.interval = try fields.restartInterval(payload);
    }
    pub fn beginScan(self: *State) void {
        self.in_scan = true;
        self.next = 0;
    }
    pub fn endScan(self: *State) void {
        self.in_scan = false;
    }
    pub fn accept(self: *State, code: u8, maximum: usize) !void {
        if (!self.in_scan or self.interval == 0) return error.InvalidJpegRestartPosition;
        if (code != 0xd0 + @as(u8, self.next)) return error.InvalidJpegRestartSequence;
        if (self.count >= maximum) return error.LimitExceeded;
        self.next +%= 1;
        self.count += 1;
    }
};
