const d = @import("reader.zig");
const Version = @import("../version.zig").Version;
const Options = @import("../record.zig").Options;
pub const DecodingPolicy = struct {
    caret: @import("properties.zig").CaretPolicy = .required,
    font_type: @import("face_name.zig").TypeInfoPolicy = .required,
    style_character: @import("style.zig").CharacterPolicy = .required,
    character_tail: @import("char_shape.zig").TailPolicy = .required,
    fill_additional: @import("fill.zig").AdditionalPolicy = .required,
};
pub const Language = enum(u3) { korean, english, hanja, japanese, other, symbol, user };
/// Same contiguous order as ID_MAPPINGS slots 8..14.
pub const Kind = enum { border_fill, char_shape, tab_def, numbering, bullet, para_shape, style };
const kind_count = @typeInfo(Kind).@"enum".field_names.len;
pub fn mappingField(kind: Kind) d.MappingField {
    return @fromBackingInt(@intCast(@backingInt(d.MappingField.border_fill) + @backingInt(kind)));
}

pub const Report = struct {
    mappings: d.IdMappings,
    bin_data_count: usize,
    face_name_count: usize,
    unresolved_font_type_count: usize = 0,
    absent_caret_count: usize = 0,
    unresolved_style_character_count: usize = 0,
    unresolved_character_tail_count: usize = 0,
    absent_fill_additional_count: usize = 0,
    memo_shape_count: usize = 0,
    track_change_author_count: usize = 0,
    track_change_count: usize = 0,
    counts: [kind_count]usize = @splat(0),

    pub fn count(self: Report, kind: Kind) usize {
        return self.counts[@backingInt(kind)];
    }
    /// Extends the legacy BinData/font check without changing validate().
    /// Optional resource counts are checked only when their mapping slots are present.
    /// Missing slots remain distinguishable through mappings.get().
    pub fn validateKnownCounts(self: Report) !void {
        try self.validate();
        try self.validateOptionalCount(.memo_shape, self.memo_shape_count);
        try self.validateOptionalCount(.track_change_author, self.track_change_author_count);
        try self.validateOptionalCount(.track_change, self.track_change_count);
        inline for (@import("../../reflection.zig").fields(Kind)) |field| {
            const kind: Kind = @fromBackingInt(@intCast(field.value));
            const n = self.mappings.get(mappingField(kind)).?;
            if (n < 0) return error.NegativeMappingCount;
            if (@as(u64, @intCast(n)) != self.count(kind)) return error.ResourceCountMismatch;
        }
    }

    pub fn validate(self: Report) !void {
        const bins = self.mappings.get(.bin_data).?;
        if (bins < 0) return error.NegativeMappingCount;
        var fonts: u64 = 0;
        for (0..7) |i| {
            const n = self.fontCount(@fromBackingInt(@intCast(i)));
            if (n < 0) return error.NegativeMappingCount;
            fonts += @intCast(n);
        }
        if (@as(u64, @intCast(bins)) != self.bin_data_count or fonts != self.face_name_count)
            return error.ResourceCountMismatch;
    }
    fn validateOptionalCount(self: Report, field: d.MappingField, actual: usize) !void {
        if (self.mappings.get(field)) |n| {
            if (n < 0) return error.NegativeMappingCount;
            if (@as(u64, @intCast(n)) != actual) return error.ResourceCountMismatch;
        }
    }
    pub fn fontCount(self: Report, language: Language) i32 {
        return self.mappings.get(@fromBackingInt(@intCast(@as(usize, @backingInt(d.MappingField.font_korean)) + @backingInt(language)))).?;
    }
    /// A 0-based language-local font ID -> 0-based FACE_NAME record ordinal.
    /// Requires validated totals; this is not a CFB stream ID or a glyph lookup.
    pub fn fontOrdinal(self: Report, language: Language, id: usize) !?usize {
        try self.validate();
        if (id >= @as(usize, @intCast(self.fontCount(language)))) return null;
        var offset: usize = 0;
        for (0..@backingInt(language)) |i| offset += @intCast(self.fontCount(@fromBackingInt(@intCast(i))));
        return offset + id;
    }
};

pub const BinDataSelection = struct {
    item: d.BinData,
    resources: Report,
};

/// No allocations from declared counts; preserve mismatches as a report.
/// Counts BinData, FACE_NAME, formatting, memo and raw track-change resources.
pub fn inspect(bytes: []const u8, version: Version, options: Options) !Report {
    return inspectWithDecodingPolicy(bytes, version, options, .{});
}

pub fn inspectWithDecodingPolicy(bytes: []const u8, version: Version, options: Options, policy: DecodingPolicy) !Report {
    return (try scan(bytes, version, options, null, policy)).report;
}

/// Resolves a one-based BinData ordinal while the same complete traversal
/// counts every known DocInfo resource. Selection never uses the storage ID.
pub fn inspectBinDataOrdinal(bytes: []const u8, version: Version, options: Options, ordinal: usize) !BinDataSelection {
    var items: [1]d.BinData = undefined;
    const resources = try inspectBinDataOrdinals(bytes, version, options, &.{ordinal}, &items);
    return .{ .item = items[0], .resources = resources };
}

/// Resolves strictly increasing one-based ordinals into caller storage during
/// the same complete resource traversal. The output order matches ordinals.
pub fn inspectBinDataOrdinals(bytes: []const u8, version: Version, options: Options, ordinals: []const usize, items: []d.BinData) !Report {
    if (ordinals.len == 0) return error.EmptyBinDataSelection;
    if (items.len != ordinals.len) return error.InvalidBinDataSelectionBuffer;
    for (ordinals, 0..) |ordinal, index| {
        if (ordinal == 0) return error.InvalidBinDataOrdinal;
        if (index != 0 and ordinal <= ordinals[index - 1]) return error.InvalidBinDataOrdinalOrder;
    }
    var selector: Selector = .{ .ordinals = ordinals, .items = items };
    const result = try scan(bytes, version, options, &selector, .{});
    if (selector.next != ordinals.len) return error.BinDataNotFound;
    return result.report;
}

const Selector = struct {
    ordinals: []const usize,
    items: []d.BinData,
    next: usize = 0,
};

const Scan = struct { report: Report };

fn scan(bytes: []const u8, version: Version, options: Options, selector: ?*Selector, policy: DecodingPolicy) !Scan {
    var it = try d.Iterator.init(bytes, version, options);
    it.caret_policy = policy.caret;
    it.font_type_policy = policy.font_type;
    it.style_character_policy = policy.style_character;
    it.character_tail_policy = policy.character_tail;
    it.fill_additional_policy = policy.fill_additional;
    var mappings: ?d.IdMappings = null;
    var bins: usize = 0;
    var fonts: usize = 0;
    var unresolved_fonts: usize = 0;
    var absent_carets: usize = 0;
    var unresolved_styles: usize = 0;
    var unresolved_character_tails: usize = 0;
    var absent_fill_additionals: usize = 0;
    var memos: usize = 0;
    var authors: usize = 0;
    var changes: usize = 0;
    var counts: [kind_count]usize = @splat(0);
    while (try it.next()) |r| switch (r.value) {
        .id_mappings => |m| {
            if (mappings != null) return error.DuplicateIdMappings;
            mappings = m;
        },
        .bin_data => |item| {
            bins += 1;
            if (selector) |selected| if (selected.next < selected.ordinals.len and bins == selected.ordinals[selected.next]) {
                selected.items[selected.next] = item;
                selected.next += 1;
            };
        },
        .properties => |properties| {
            if (!properties.caret_present) absent_carets += 1;
        },
        .face_name => |font| {
            fonts += 1;
            if (font.unresolved_type_info != null) unresolved_fonts += 1;
        },
        .style => |style| {
            counts[@backingInt(Kind.style)] += 1;
            if (!style.char_shape_present) unresolved_styles += 1;
        },
        .char_shape => |shape| {
            counts[@backingInt(Kind.char_shape)] += 1;
            if (shape.unresolved_tail != null) unresolved_character_tails += 1;
        },
        .border_fill => |border| {
            counts[@backingInt(Kind.border_fill)] += 1;
            if (border.fill.data == .known and !border.fill.data.known.additional_present) absent_fill_additionals += 1;
        },
        .memo_shape => memos += 1,
        else => {
            if (r.framing.tag == @backingInt(d.Tag.track_change_author)) authors += 1;
            if (r.framing.tag == @backingInt(d.Tag.track_change)) changes += 1;
            inline for (@import("../../reflection.zig").fields(Kind)) |field| {
                if (r.framing.tag == @backingInt(@field(d.Tag, field.name))) counts[field.value] += 1;
            }
        },
    };
    return .{ .report = .{ .mappings = mappings orelse return error.MissingIdMappings, .bin_data_count = bins, .face_name_count = fonts, .unresolved_font_type_count = unresolved_fonts, .absent_caret_count = absent_carets, .unresolved_style_character_count = unresolved_styles, .unresolved_character_tail_count = unresolved_character_tails, .absent_fill_additional_count = absent_fill_additionals, .memo_shape_count = memos, .track_change_author_count = authors, .track_change_count = changes, .counts = counts } };
}
