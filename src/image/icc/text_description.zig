const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const Options = struct { max_bytes: usize = 64 * 1024 * 1024 };
pub const View = struct {
    ascii: []const u8,
    unicode_language: u32,
    unicode: []const u8,
    script_code: u16,
    script: []const u8,
    script_unused: []const u8,
    trailing: []const u8,
    unicode_deferred: bool = true,
    script_deferred: bool = true,
    language_deferred: bool = true,
};
/// Counted borrowed regions, including terminators; never align inner fields.
/// Trailing bytes and unused ScriptCode storage are preserved, not certified.
pub fn parse(data: []const u8, options: Options) !View {
    if (data.len > options.max_bytes) return error.LimitExceeded;
    const signature = try @import("type_prefix.zig").inspect(data);
    if (!std.mem.eql(u8, &signature, "desc")) return error.InvalidIccDescriptionType;
    var reader: Reader = .{ .bytes = data, .offset = 8 };
    const count = try integer(u32, &reader);
    const ascii = try reader.take(count);
    try @import("ascii_terminated.zig").validate(ascii);
    const language = try integer(u32, &reader);
    const units = try integer(u32, &reader);
    if (units > (data.len - reader.offset) / 2) return error.UnexpectedEnd;
    const unicode = try reader.take(@as(usize, units) * 2);
    if (unicode.len != 0 and (unicode[unicode.len - 2] != 0 or unicode[unicode.len - 1] != 0)) return error.InvalidIccTextTerminator;
    const code = try integer(u16, &reader);
    const script_count = (try reader.take(1))[0];
    if (script_count > 67) return error.InvalidIccScriptCount;
    const storage = try reader.take(67);
    const script = storage[0..script_count];
    if (script.len != 0 and script[script.len - 1] != 0) return error.InvalidIccTextTerminator;
    return .{ .ascii = ascii, .unicode_language = language, .unicode = unicode, .script_code = code, .script = script, .script_unused = storage[script_count..], .trailing = data[reader.offset..] };
}
fn integer(comptime T: type, reader: *Reader) !T {
    const bytes = try reader.take(@sizeOf(T));
    return std.mem.readInt(T, bytes[0..@sizeOf(T)], .big);
}
