const Reader = @import("../../binary/reader.zig").Reader;
const Records = @import("../../binary/record_array.zig").Records;
pub const Point = @import("shape_point.zig").Point;
pub const Layout = enum { separate_axes, interleaved };
pub const CountedLayout = enum { specified_i16_axes, observed_i32_points };
const Coordinate = struct {
    value: i32,
    pub fn read(r: *Reader) !Coordinate {
        return .{ .value = try r.readInt(i32) };
    }
};
/// Borrowed counted points. Count bounds are checked before multiplication or iteration.
pub const Points = struct {
    raw: []const u8,
    layout: Layout,
    pub fn readCounted(reader: *Reader, layout: CountedLayout) !Points {
        var r = reader.*;
        const n: i32 = switch (layout) {
            .specified_i16_axes => try r.readInt(i16),
            .observed_i32_points => try r.readInt(i32),
        };
        if (n < 0) return error.NegativePointCount;
        const result = try read(&r, @intCast(n), if (layout == .specified_i16_axes) .separate_axes else .interleaved);
        reader.* = r;
        return result;
    }
    pub fn read(reader: *Reader, count_value: usize, layout: Layout) !Points {
        var r = reader.*;
        _ = try r.take(0); // Share Reader's cursor validation before subtracting.
        if (count_value > (r.bytes.len - r.offset) / 8) return error.UnexpectedEnd;
        const raw = try r.take(count_value * 8);
        reader.* = r;
        return .{ .raw = raw, .layout = layout };
    }
    pub fn count(self: Points) usize {
        return self.raw.len / 8;
    }
    pub fn get(self: Points, index: usize) ?Point {
        if (index >= self.count()) return null;
        if (self.layout == .interleaved) return (Records(Point, 8){ .raw = self.raw }).get(index);
        const half = self.raw.len / 2;
        const x: Records(Coordinate, 4) = .{ .raw = self.raw[0..half] };
        const y: Records(Coordinate, 4) = .{ .raw = self.raw[half..] };
        return .{ .x = x.get(index).?.value, .y = y.get(index).?.value };
    }
};
