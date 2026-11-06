//! Standards-authored, deterministic empty HWP 5.0.1.7 document.
//! No template, environment, filesystem, clock, or user metadata is consulted.
const std = @import("std");
const cfb = @import("../cfb/writer.zig");
const records = @import("../hwp5/record_writer.zig");
const controls = @import("../hwp5/body/control_rules.zig");
const defaults = @import("defaults.zig");
const record_limit = 4096;

/// Creates an uncompressed CFB containing one A4 portrait section and one empty
/// paragraph. The caller owns the returned bytes and frees them with `a.free`.
/// Defaults: 함초롬바탕 11pt, Normal paragraph style, Korean (1042), 160% spacing,
/// 20mm page margins and 10mm header/footer margins. No cached line layout.
pub fn create(a: std.mem.Allocator) ![]u8 {
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);

    var header: [256]u8 = @splat(0);
    @memcpy(header[0..17], "HWP Document File");
    put(u32, &header, 32, 0x05000107);
    // Flags remain zero: both DocInfo and Section0 contain raw record bytes.

    // Tables 15-16: section count, six start numbers, then caret coordinates.
    var properties: [26]u8 = @splat(0);
    put(u16, &properties, 0, 1); // one section, independent of numbering policy
    for (1..7) |i| put(u16, &properties, i * 2, defaults.first_number);
    try append(a, &doc, 16, 0, &properties);

    // Table 18: seven separate font groups, one character/paragraph/style/tab.
    // 5.0.1.7 precedes the memo/track-change mapping fields.
    var mappings: [60]u8 = @splat(0);
    for (0..defaults.font_languages.len) |i| put(u32, &mappings, (i + 1) * 4, 1);
    for ([_]usize{ 9, 10, 13, 14 }) |i| put(u32, &mappings, i * 4, 1);
    try append(a, &doc, 17, 0, &mappings);
    // Table 19: no optional substitute/type/default-name fields. Font names
    // designate a requested face; creation never probes installed fonts.
    const face = try @import("../hwp5/edit/font_face_payload.zig").write(a, defaults.font_name, 128, record_limit);
    defer a.free(face);
    for (defaults.font_languages) |_| try append(a, &doc, 19, 1, face);

    // Table 33: zero font IDs, 100% width/relative size, black undecorated 11pt.
    // Version 5.0.1.7 has neither border-fill nor independent strike-color tail.
    var character: [68]u8 = @splat(0);
    @memset(character[14..21], defaults.font_scale);
    @memset(character[28..35], defaults.font_scale);
    put(u32, &character, 42, defaults.font_height);
    put(u32, &character, 60, 0xffffffff); // no shading
    try append(a, &doc, 21, 1, &character);
    const tabs: [8]u8 = @splat(0);
    try append(a, &doc, 22, 1, &tabs);

    // Tables 43-46: left alignment, Korean character wrapping, no numbering or
    // border, tab 0, 160% legacy spacing and the 5.0.1.7 attributes2 DWORD.
    var paragraph: [46]u8 = @splat(0);
    put(u32, &paragraph, 0, (switch (defaults.alignment) {
        .left => @as(u32, 1 << 2),
    }) | (1 << 7));
    put(u32, &paragraph, 24, defaults.line_spacing);
    try append(a, &doc, 25, 1, &paragraph);

    // Table 47: 바탕글 / Normal, paragraph style 0, next style 0, ko-KR.
    const local_name = try std.unicode.utf8ToUtf16LeAlloc(a, defaults.style_name);
    defer a.free(local_name);
    const english_name = try std.unicode.utf8ToUtf16LeAlloc(a, defaults.style_english_name);
    defer a.free(english_name);
    const style = try a.alloc(u8, 12 + (local_name.len + english_name.len) * 2);
    defer a.free(style);
    @memset(style, 0);
    put(u16, style, 0, @intCast(local_name.len));
    @memcpy(style[2..][0 .. local_name.len * 2], std.mem.sliceAsBytes(local_name));
    const english_at = 2 + local_name.len * 2;
    put(u16, style, english_at, @intCast(english_name.len));
    @memcpy(style[english_at + 2 ..][0 .. english_name.len * 2], std.mem.sliceAsBytes(english_name));
    put(u16, style, style.len - 6, defaults.language_id);
    try append(a, &doc, 26, 1, style);

    // Tables 58, 60-61: two eight-unit nonprinting control tokens plus CR.
    // The sole paragraph has no visible text; its first character run is at 0.
    var para_header: [22]u8 = @splat(0);
    put(u32, &para_header, 0, 0x80000011);
    put(u32, &para_header, 4, (1 << 2) | (1 << 13));
    put(u16, &para_header, 12, 1);
    try append(a, &body, 66, 0, &para_header);
    var text: [34]u8 = @splat(0);
    token(text[0..16], controls.section_id);
    token(text[16..32], controls.column_id);
    put(u16, &text, 32, 13);
    try append(a, &body, 67, 1, &text);
    const run: [8]u8 = @splat(0);
    try append(a, &body, 68, 1, &run);

    // Table 129: control ID + section properties. Page settings are child
    // records, never inline section bytes. Numbering ID 0 means no outline.
    var section: [30]u8 = @splat(0);
    put(u32, &section, 0, controls.section_id);
    put(u32, &section, 14, defaults.tab_spacing);
    put(u16, &section, 20, defaults.first_number);
    for ([_]usize{ 22, 24, 26 }) |offset| put(u16, &section, offset, defaults.first_number);
    put(u16, &section, 28, defaults.language_id);
    try append(a, &body, 71, 1, &section);
    // Table 131, rounded to 1/7200 inch: A4 210x297mm, portrait, one-sided.
    var page: [40]u8 = @splat(0);
    const dimensions = [_]u32{ defaults.page_width, defaults.page_height, defaults.page_margin, defaults.page_margin, defaults.page_margin, defaults.page_margin, defaults.header_footer_margin, defaults.header_footer_margin, 0, 0 };
    for (dimensions, 0..) |value, i| put(u32, &page, i * 4, value);
    try append(a, &body, 73, 2, &page);

    // Table 138: one equal-width column, no separator line.
    var column: [16]u8 = @splat(0);
    put(u32, &column, 0, controls.column_id);
    put(u16, &column, 4, (1 << 2) | (1 << 12));
    try append(a, &body, 71, 1, &column);

    return cfb.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = doc.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = body.items },
    }, .{});
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u10, level: u10, payload: []const u8) !void {
    try records.append(a, out, tag, level, payload, record_limit);
}

fn put(comptime T: type, bytes: []u8, offset: usize, value: T) void {
    std.mem.writeInt(T, bytes[offset..][0..@sizeOf(T)], value, .little);
}

fn token(bytes: []u8, id: u32) void {
    put(u16, bytes, 0, 2);
    put(u32, bytes, 2, id);
    put(u16, bytes, 14, 2);
}
