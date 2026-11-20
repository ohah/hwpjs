//! Standards-authored, deterministic empty HWP5 with a coherent typed profile.
//! No template, environment, filesystem, clock, or user metadata is consulted.
const std = @import("std");
const cfb = @import("../cfb/writer.zig");
const records = @import("../hwp5/record_writer.zig");
const controls = @import("../hwp5/body/control_rules.zig");
const defaults = @import("defaults.zig");
const profiles = @import("hwp5_profile.zig");
const Character = @import("../hwp5/docinfo/char_shape.zig").CharShape;
const Paragraph = @import("../hwp5/docinfo/para_shape.zig").ParaShape;
const section_defaults = @import("section_defaults.zig");
const section_writer = @import("../hwp5/body/section_child_writer.zig");
const record_limit = 4096;

/// Creates an uncompressed CFB containing one A4 portrait section and one empty
/// paragraph. The caller owns the returned bytes and frees them with `a.free`.
/// Defaults: 함초롬바탕 11pt, Normal paragraph style, Korean (1042), 160% spacing,
/// 20mm page margins and 10mm header/footer margins. No cached line layout.
pub fn create(a: std.mem.Allocator) ![]u8 {
    return createWithProfile(a, profiles.default);
}

/// Only fresh in-memory construction. Existing sources never pass this path.
pub fn createWithProfile(a: std.mem.Allocator, profile: profiles.Profile) ![]u8 {
    const layout = profiles.layout(profile);
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);

    var header: [256]u8 = @splat(0);
    @memcpy(header[0..17], "HWP Document File");
    put(u32, &header, 32, layout.version.raw);
    // Flags remain zero: both DocInfo and Section0 contain raw record bytes.

    // Table14: section count, six start numbers, then caret coordinates.
    var properties: [26]u8 = @splat(0);
    put(u16, &properties, 0, 1); // one section, independent of numbering policy
    for (1..7) |i| put(u16, &properties, i * 2, defaults.first_number);
    try append(a, &doc, 16, 0, &properties);

    // Tables15-16: seven font groups, one character/paragraph/style/tab.
    // Modern declares memo count0; neither profile reaches tracking>=5.0.3.2.
    var mappings: [profiles.maximum.mappingBytes()]u8 = @splat(0);
    for (0..defaults.font_languages.len) |i| put(u32, &mappings, (i + 1) * 4, 1);
    for ([_]usize{ 9, 10, 13, 14 }) |i| put(u32, &mappings, i * 4, 1);
    try append(a, &doc, 17, 0, mappings[0..layout.mappingBytes()]);
    // Table 19: no optional substitute/type/default-name fields. Font names
    // designate a requested face; creation never probes installed fonts.
    const face = try @import("../hwp5/edit/font_face_payload.zig").write(a, defaults.font_name, 128, record_limit);
    defer a.free(face);
    for (defaults.font_languages) |_| try append(a, &doc, 19, 1, face);

    // Table 33: zero font IDs, 100% width/relative size, black undecorated 11pt.
    // Emit the gated border/strike fields only for the modern profile.
    // Explicit fields sum74, despite table33's contradictory printed total72.
    var character: [profiles.maximum.character_bytes]u8 = @splat(0);
    @memset(character[14..21], defaults.font_scale);
    @memset(character[28..35], defaults.font_scale);
    put(u32, &character, 42, defaults.font_height);
    put(u32, &character, 60, 0xffffffff); // no shading
    if (profile == .modern_5_0_3_0) {
        put(u16, &character, Character.border_fill_offset, 0); // no border
        put(u32, &character, Character.strike_color_offset, 0); // inactive black
    }
    try append(a, &doc, 21, 1, character[0..layout.character_bytes]);
    const tabs: [8]u8 = @splat(0);
    try append(a, &doc, 22, 1, &tabs);

    // Tables 43-46: left alignment, Korean character wrapping, no numbering or
    // border, tab0 and attributes2. Modern owns both explicit attrs3/spacing
    // fields; legacy spacing is retained without replacing modern authority.
    var paragraph: [profiles.maximum.paragraph_bytes]u8 = @splat(0);
    put(u32, &paragraph, 0, (switch (defaults.alignment) {
        .left => @as(u32, 1 << 2),
    }) | (1 << 7));
    put(u32, &paragraph, 24, defaults.line_spacing);
    if (profile == .modern_5_0_3_0) {
        put(u32, &paragraph, Paragraph.modern_spacing_offset, 0); // percent
        put(u32, &paragraph, Paragraph.modern_spacing_offset + 4, defaults.line_spacing);
    }
    try append(a, &doc, 25, 1, paragraph[0..layout.paragraph_bytes]);

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

    // Table129 children, physically owned by this secd (level1 -> level2).
    // Footnote precedes endnote; no note content, master page or new resource
    // is invented. Only the fresh modern profile opts into these children.
    if (layout.section_note_layout) |note_layout| {
        inline for (.{ .footnote, .endnote }) |kind| {
            const shape = section_defaults.note(note_layout, kind);
            _ = try shape.attributeSemantics(kind);
            const encoded = try section_writer.note(shape);
            try append(a, &body, 74, 2, encoded.bytes[0..encoded.len]);
        }
        const border = try section_writer.pageBorder(section_defaults.border);
        try append(a, &body, 75, 2, &border);
    }

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
