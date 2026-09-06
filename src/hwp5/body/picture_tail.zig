const Reader = @import("../../binary/reader.zig").Reader;
pub const additional = @import("picture_additional.zig");
const Effects = @import("picture_effects.zig").Effects;
/// Starts after the explicitly selected instance-id prefix, never at a guessed tail offset.
pub const Tail = struct {
    effects: Effects,
    properties: ?additional.Additional,
    pub fn read(reader: *Reader, layout: ?additional.Layout) !Tail {
        var r = reader.*;
        const effects = try Effects.read(&r);
        const properties = if (layout) |selected| try additional.Additional.read(&r, selected) else null;
        reader.* = r;
        return .{ .effects = effects, .properties = properties };
    }
};
