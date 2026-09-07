const Reader = @import("../../binary/reader.zig").Reader;
const strings = @import("../utf16_string.zig");
const std = @import("std");
pub const tag = 91;
pub const Kind = enum(u32) { unknown, push_button, check_box, combo_box, radio_button, edit };

/// Explicit observed envelope, not a complete form/property parser.
/// All slices borrow the input; unknown identifiers, length word and tail survive.
pub const View = struct {
    type_id: [4]u8,
    secondary_type_id: [4]u8,
    raw_length: u32,
    properties: []const u8,
    extra: []const u8,
    pub fn parseObserved(bytes: []const u8) !View {
        var r: Reader = .{ .bytes = bytes };
        const type_id = (try r.take(4))[0..4].*;
        const secondary = (try r.take(4))[0..4].*;
        const raw_length = try r.readInt(u32);
        const properties = try strings.read(&r);
        return .{ .type_id = type_id, .secondary_type_id = secondary, .raw_length = raw_length, .properties = properties, .extra = bytes[r.offset..] };
    }
    pub fn kind(self: View) Kind {
        inline for (.{ .{ "tbp+", Kind.push_button }, .{ "tbc+", Kind.check_box }, .{ "boc+", Kind.combo_box }, .{ "tbr+", Kind.radio_button }, .{ "tde+", Kind.edit } }) |pair| {
            if (std.mem.eql(u8, &self.type_id, pair[0])) return pair[1];
        }
        return .unknown;
    }
};
