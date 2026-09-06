const Reader = @import("../../binary/reader.zig").Reader;
pub const Kind = enum(i32) {
    alpha,
    alpha_mod,
    alpha_off,
    red,
    red_mod,
    red_off,
    green,
    green_mod,
    green_off,
    blue,
    blue_mod,
    blue_off,
    hue,
    hue_mod,
    hue_off,
    sat,
    sat_mod,
    sat_off,
    lum,
    lum_mod,
    lum_off,
    shade,
    tint,
    gray,
    comp,
    gamma,
    inv_gamma,
    inv,
};
pub const Effect = struct {
    kind_raw: i32,
    value_bits: u32,
    pub fn read(reader: *Reader) !Effect {
        var r = reader.*;
        const e: Effect = .{ .kind_raw = try r.readInt(i32), .value_bits = try r.readInt(u32) };
        reader.* = r;
        return e;
    }
    pub fn kind(self: Effect) ?Kind {
        if (self.kind_raw < 0 or self.kind_raw > @intFromEnum(Kind.inv)) return null;
        return @enumFromInt(self.kind_raw);
    }
    pub fn value(self: Effect) f32 {
        return @bitCast(self.value_bits);
    }
};
pub const Effects = @import("../../binary/record_array.zig").Records(Effect, 8);
