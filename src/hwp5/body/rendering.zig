const Reader = @import("../../binary/reader.zig").Reader;
pub const Matrix = struct {
    bits: [6]u64,
    pub fn read(reader: *Reader) !Matrix {
        var r = reader.*;
        var result: Matrix = undefined;
        for (&result.bits) |*bits| bits.* = try r.readInt(u64);
        reader.* = r;
        return result;
    }
    pub fn value(self: Matrix, index: usize) ?f64 {
        return if (index < self.bits.len) @bitCast(self.bits[index]) else null;
    }
};
pub const Pair = struct {
    scale: Matrix,
    rotation: Matrix,
    pub fn read(reader: *Reader) !Pair {
        var r = reader.*;
        const result: Pair = .{ .scale = try Matrix.read(&r), .rotation = try Matrix.read(&r) };
        reader.* = r;
        return result;
    }
};
pub const Pairs = @import("../../binary/record_array.zig").Records(Pair, 96);
pub const Rendering = struct {
    translation: Matrix,
    pairs: Pairs,
    pub fn read(reader: *Reader) !Rendering {
        var r = reader.*;
        const count = try r.readInt(u16);
        const translation = try Matrix.read(&r);
        const pairs = try Pairs.parse(try r.take(@as(usize, count) * 96));
        reader.* = r;
        return .{ .translation = translation, .pairs = pairs };
    }
};
