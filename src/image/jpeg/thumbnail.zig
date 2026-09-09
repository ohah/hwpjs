const Reader = @import("../../binary/reader.zig").Reader;

pub const Dimensions = struct {
    width: u8,
    height: u8,

    pub fn read(reader: *Reader, nonzero: bool) !Dimensions {
        const width = try reader.readInt(u8);
        const height = try reader.readInt(u8);
        if (nonzero and (width == 0 or height == 0)) return error.InvalidJpegThumbnailDimensions;
        return .{ .width = width, .height = height };
    }

    pub fn pixels(self: Dimensions) usize {
        return @as(usize, self.width) * self.height;
    }
};

/// Borrowed packed RGB8 thumbnail used by both JFIF and JFXX.
pub const Rgb = struct {
    dimensions: Dimensions,
    bytes: []const u8,

    pub fn read(reader: *Reader, nonzero: bool) !Rgb {
        const dimensions = try Dimensions.read(reader, nonzero);
        return .{ .dimensions = dimensions, .bytes = try reader.take(dimensions.pixels() * 3) };
    }

    pub fn pixel(self: Rgb, index: usize) ?[3]u8 {
        if (index >= self.dimensions.pixels()) return null;
        return self.bytes[index * 3 ..][0..3].*;
    }
};

pub const Indexed = struct {
    dimensions: Dimensions,
    palette: *const [768]u8,
    indices: []const u8,

    pub fn read(reader: *Reader) !Indexed {
        const dimensions = try Dimensions.read(reader, true);
        const palette = (try reader.take(768))[0..768];
        return .{ .dimensions = dimensions, .palette = palette, .indices = try reader.take(dimensions.pixels()) };
    }

    pub fn pixel(self: Indexed, index: usize) ?[3]u8 {
        if (index >= self.indices.len) return null;
        const at = @as(usize, self.indices[index]) * 3;
        return self.palette[at..][0..3].*;
    }
};
