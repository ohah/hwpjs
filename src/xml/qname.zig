const View = @import("text.zig").View;
const scalars = @import("scalars.zig");
const chars = @import("characters.zig");
pub const QName = struct { prefix: ?View, local: View };
/// Borrowed QName split. No prefix binding or URI policy belongs here.
pub fn parse(name: View) !QName {
    var offset: usize = 0;
    var start: usize = 0;
    var prefix: ?View = null;
    var first = true;
    while (try scalars.read(name.raw, offset, name.encoding)) |c| {
        if (c.value == ':') {
            if (first or prefix != null) return error.InvalidXmlQName;
            prefix = .{ .raw = name.raw[0..offset], .encoding = name.encoding };
            start = c.end;
            first = true;
        } else {
            if (if (first) !chars.nameStart(c.value) else !chars.nameContinue(c.value)) return error.InvalidXmlQName;
            first = false;
        }
        offset = c.end;
    }
    if (first) return error.InvalidXmlQName;
    return .{ .prefix = prefix, .local = .{ .raw = name.raw[start..], .encoding = name.encoding } };
}
pub fn ncname(name: View) !void {
    if ((try parse(name)).prefix != null) return error.InvalidXmlNCName;
}
