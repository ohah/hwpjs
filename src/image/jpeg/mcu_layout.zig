const Frame = @import("frame.zig").Frame;
const Scan = @import("scan.zig").Scan;

pub const Slot = struct { component: usize, frame_component: usize, x: u32, y: u32, horizontal: u32, vertical: u32 };
pub const Position = struct { component: usize, frame_component: usize, x: u32, y: u32 };

/// DCT block order for parsed frame/scan headers. Height is resolved by the
/// caller from SOF/DNL. Includes the padded blocks of interleaved MCUs.
pub const Layout = struct {
    columns: u32,
    rows: u32,
    slots: [10]Slot,
    count: usize,
    mcus: u64,
    blocks: u64,

    pub fn init(frame: Frame, scan: Scan, height: u16, maximum: usize) !Layout {
        if (frame.process.mode == .lossless) return error.UnsupportedJpegDctLayout;
        if (height == 0) return error.MissingJpegDnl;
        var horizontal: u32 = 0;
        var vertical: u32 = 0;
        for (0..frame.components.count()) |i| {
            const c = frame.components.get(i).?;
            horizontal = @max(horizontal, c.horizontal());
            vertical = @max(vertical, c.vertical());
        }
        const single = scan.components.count() == 1;
        var result: Layout = .{ .columns = 0, .rows = 0, .slots = undefined, .count = 0, .mcus = 0, .blocks = 0 };
        for (0..scan.components.count()) |i| {
            const sc = scan.components.get(i).?;
            var index: ?usize = null;
            for (0..frame.components.count()) |j| if (frame.components.get(j).?.id == sc.id) {
                index = j;
                break;
            };
            const fi = index orelse return error.InvalidJpegComponentReference;
            const fc = frame.components.get(fi).?;
            const h: u32 = if (single) 1 else fc.horizontal();
            const v: u32 = if (single) 1 else fc.vertical();
            if (single) {
                result.columns = ceil(@as(u32, frame.width) * fc.horizontal(), 8 * horizontal);
                result.rows = ceil(@as(u32, height) * fc.vertical(), 8 * vertical);
            }
            for (0..v) |y| for (0..h) |x| {
                if (result.count == result.slots.len) return error.InvalidJpegMcuSampling;
                result.slots[result.count] = .{ .component = i, .frame_component = fi, .x = @intCast(x), .y = @intCast(y), .horizontal = h, .vertical = v };
                result.count += 1;
            };
        }
        if (!single) {
            result.columns = ceil(frame.width, 8 * horizontal);
            result.rows = ceil(height, 8 * vertical);
        }
        result.mcus = @as(u64, result.columns) * result.rows;
        result.blocks = result.mcus * result.count;
        if (result.blocks > maximum) return error.LimitExceeded;
        return result;
    }

    pub fn position(self: Layout, index: u64) ?Position {
        if (index >= self.blocks) return null;
        const slot = self.slots[@intCast(index % self.count)];
        const mcu = index / self.count;
        return .{ .component = slot.component, .frame_component = slot.frame_component, .x = @as(u32, @intCast(mcu % self.columns)) * slot.horizontal + slot.x, .y = @as(u32, @intCast(mcu / self.columns)) * slot.vertical + slot.y };
    }
};

fn ceil(n: u32, d: u32) u32 {
    return n / d + @intFromBool(n % d != 0);
}
