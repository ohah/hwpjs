const Frame = @import("frame.zig").Frame;
const Scan = @import("scan.zig").Scan;
pub const unseen = 255;

/// Per-coefficient history, indexed by frame declaration order, not component ID.
pub const History = struct {
    levels: [4][64]u8 = @splat(@splat(unseen)),

    /// Frame and scan must have passed their parsers and be progressive.
    /// Partial bands may split or merge; every coefficient must match Ah.
    pub fn advance(self: *History, frame: Frame, scan: Scan) !void {
        var next = self.levels;
        for (0..scan.components.count()) |j| {
            const id = scan.components.get(j).?.id;
            for (0..frame.components.count()) |i| {
                if (frame.components.get(i).?.id != id) continue;
                if (scan.spectral_start != 0 and next[i][0] == unseen) return error.MissingJpegInitialDcScan;
                for (scan.spectral_start..@as(usize, scan.spectral_end) + 1) |k| {
                    const prior = next[i][k];
                    if (scan.approximation_high == 0) {
                        if (prior != unseen) return error.DuplicateJpegInitialBand;
                    } else if (prior != scan.approximation_high) return error.InvalidJpegProgression;
                    next[i][k] = scan.approximation_low;
                }
                break;
            }
        }
        self.levels = next;
    }
};
