const Frame = @import("frame.zig").Frame;
const Scan = @import("scan.zig").Scan;
const Geometry = @import("component_geometry.zig").Geometry;

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
        const geometry = try Geometry.init(frame, height);
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
                const grid = geometry.component(fi).?.blocks();
                result.columns = grid.width;
                result.rows = grid.height;
            }
            for (0..v) |y| for (0..h) |x| {
                if (result.count == result.slots.len) return error.InvalidJpegMcuSampling;
                result.slots[result.count] = .{ .component = i, .frame_component = fi, .x = @intCast(x), .y = @intCast(y), .horizontal = h, .vertical = v };
                result.count += 1;
            };
        }
        if (!single) {
            const grid = geometry.interleaved();
            result.columns = grid.width;
            result.rows = grid.height;
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
