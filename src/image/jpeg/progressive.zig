const Frame = @import("frame.zig").Frame;
const Store = @import("table_store.zig").Store;
const selection = @import("scan_tables.zig");
const progression = @import("progression.zig");
const cursor = @import("table_cursor.zig");
const huffman = @import("huffman.zig");

pub const Options = struct { max_scans: usize = 65536 };
pub const Report = struct { scans: usize, unseen_coefficients: usize, partial_coefficients: usize, full_coefficients: usize };

/// One parsed, non-hierarchical Huffman progressive frame. Input views borrow
/// immutable buffers. This validates scan declarations, not entropy completion.
pub const State = struct {
    frame: Frame,
    options: Options,
    tables: Store = .{},
    history: progression.History = .{},
    altered_since_scan: [4]bool = @splat(false),
    scans: usize = 0,

    pub fn init(frame: Frame, options: Options) !State {
        if (frame.process.mode != .progressive) return error.UnsupportedJpegProgressionProcess;
        if (frame.process.coding != .huffman) return error.UnsupportedJpegArithmeticTables;
        return .{ .frame = frame, .options = options };
    }

    pub fn installQuantization(self: *State, payload: []const u8, options: cursor.Options) !void {
        const changed = try self.tables.installQuantizationTracked(payload, options);
        for (0..self.frame.components.count()) |i| {
            const destination = self.frame.components.get(i).?.quantization;
            if (self.history.levels[i][0] != progression.unseen and changed & (@as(u4, 1) << @as(u2, @intCast(destination))) != 0) self.altered_since_scan[i] = true;
        }
    }

    pub fn installHuffman(self: *State, payload: []const u8, options: huffman.Options) !void {
        try self.tables.installHuffman(payload, options);
    }

    pub fn accept(self: *State, payload: []const u8) !selection.Resolved {
        if (self.scans >= self.options.max_scans) return error.LimitExceeded;
        const resolved = try selection.resolve(&self.tables, self.frame, payload);
        for (resolved.components[0..resolved.count]) |component| {
            for (0..self.frame.components.count()) |i| {
                if (self.frame.components.get(i).?.id == component.id and self.altered_since_scan[i]) return error.AlteredJpegProgressiveQuantization;
            }
        }
        try self.history.advance(self.frame, resolved.scan);
        self.scans += 1;
        return resolved;
    }

    /// Reports missing/partial declarations; does not certify a complete JPEG.
    pub fn report(self: *const State) Report {
        var result: Report = .{ .scans = self.scans, .unseen_coefficients = 0, .partial_coefficients = 0, .full_coefficients = 0 };
        for (self.history.levels[0..self.frame.components.count()]) |component| for (component) |level| {
            if (level == progression.unseen) {
                result.unseen_coefficients += 1;
            } else if (level == 0) {
                result.full_coefficients += 1;
            } else result.partial_coefficients += 1;
        };
        return result;
    }
};
