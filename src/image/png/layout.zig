const Header = @import("header.zig").Header;
pub const Pass = struct {
    x: u32 = 0,
    y: u32 = 0,
    dx: u32 = 1,
    dy: u32 = 1,
    width: u32 = 0,
    height: u32 = 0,
    row_bytes: usize = 0,
    offset: usize = 0,
};
pub const Layout = struct {
    passes: [7]Pass = @splat(.{}),
    count: usize,
    stride: usize,
    bytes: usize = 0,
    rows: usize = 0,
    nonempty_passes: usize = 0,
    pub fn init(h: Header, max_bytes: usize) !Layout {
        const bits: u64 = @as(u64, try h.channels()) * h.bit_depth;
        var result: Layout = .{ .count = if (h.interlace == 0) 1 else 7, .stride = @intCast((bits + 7) / 8) };
        const adam7 = [_][4]u32{ .{ 0, 0, 8, 8 }, .{ 4, 0, 8, 8 }, .{ 0, 4, 4, 8 }, .{ 2, 0, 4, 4 }, .{ 0, 2, 2, 4 }, .{ 1, 0, 2, 2 }, .{ 0, 1, 1, 2 } };
        for (result.passes[0..result.count], 0..) |*pass, index| {
            const grid = if (h.interlace == 0) [4]u32{ 0, 0, 1, 1 } else adam7[index];
            pass.* = .{ .x = grid[0], .y = grid[1], .dx = grid[2], .dy = grid[3], .width = extent(h.width, grid[0], grid[2]), .height = extent(h.height, grid[1], grid[3]), .offset = result.bytes };
            if (pass.width == 0 or pass.height == 0) continue;
            const row_bytes = (@as(u64, pass.width) * bits + 7) / 8;
            // Divide budget first: avoid multiplication overflow, including wasm32.
            const remaining = max_bytes - result.bytes;
            if (row_bytes + 1 > remaining / pass.height) return error.LimitExceeded;
            pass.row_bytes = @intCast(row_bytes);
            result.bytes += (pass.row_bytes + 1) * pass.height;
            result.rows += pass.height;
            result.nonempty_passes += 1;
        }
        return result;
    }
};
fn extent(size: u32, start: u32, step: u32) u32 {
    return if (size <= start) 0 else 1 + (size - start - 1) / step;
}
