const Input = @import("input.zig").Input;
const chars = @import("characters.zig");
pub const Name = @import("text.zig").View;
/// Consume one Name, leaving the delimiter unread. No namespace or reserved-name
/// policy here. Failure does not consume caller input or its character budget.
pub fn parse(input: *Input, max_bytes: usize) !Name {
    var cursor = input.*;
    var first = true;
    while (true) {
        var look = cursor;
        const c = (try look.next()) orelse break;
        if (if (first) !chars.nameStart(c.value) else !chars.nameContinue(c.value)) break;
        if (c.end - input.offset > max_bytes) return error.LimitExceeded;
        cursor = look;
        first = false;
    }
    if (first) return error.InvalidXmlName;
    const result: Name = .{ .raw = input.bytes[input.offset..cursor.offset], .encoding = input.encoding };
    input.* = cursor;
    return result;
}
