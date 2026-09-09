const Frame = @import("frame.zig").Frame;
const Scan = @import("scan.zig").Scan;

/// Header coverage only: one scan per component in a non-progressive frame.
/// Frame and scans must be parsed against the same immutable frame bytes.
pub const State = struct {
    frame: Frame,
    seen: [255]bool = @splat(false),
    covered: usize = 0,
    scans: usize = 0,

    pub fn init(frame: Frame) !State {
        if (frame.process.mode == .progressive) return error.UnsupportedJpegSequentialCoverage;
        return .{ .frame = frame };
    }

    pub fn accept(self: *State, scan: Scan) !void {
        var next = self.*;
        for (0..scan.components.count()) |j| {
            const id = scan.components.get(j).?.id;
            var index: ?usize = null;
            for (0..self.frame.components.count()) |i| if (self.frame.components.get(i).?.id == id) {
                index = i;
                break;
            };
            const i = index orelse return error.InvalidJpegComponentReference;
            if (next.seen[i]) return error.DuplicateJpegComponentScan;
            next.seen[i] = true;
            next.covered += 1;
        }
        next.scans += 1;
        self.* = next;
    }

    pub fn finish(self: *const State) !void {
        if (self.covered != self.frame.components.count()) return error.MissingJpegComponentScan;
    }
};
