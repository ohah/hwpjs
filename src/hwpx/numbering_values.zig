const std = @import("std");

// Hancom OWPML enumdef.h g_NumberTypeList, g_AutoNumTypeList and g_PageNumPosList.
const number_types = [_][]const u8{
    "DIGIT",                 "CIRCLED_DIGIT",       "ROMAN_CAPITAL",     "ROMAN_SMALL",             "LATIN_CAPITAL",        "LATIN_SMALL",
    "CIRCLED_LATIN_CAPITAL", "CIRCLED_LATIN_SMALL", "HANGUL_SYLLABLE",   "CIRCLED_HANGUL_SYLLABLE", "HANGUL_JAMO",          "CIRCLED_HANGUL_JAMO",
    "HANGUL_PHONETIC",       "IDEOGRAPH",           "CIRCLED_IDEOGRAPH", "DECAGON_CIRCLE",          "DECAGON_CIRCLE_HANJA", "SYMBOL",
    "USER_CHAR",             "SYMBOL2",             "IMAGE",             "2DIGIT",
};
const auto_types = [_][]const u8{ "PAGE", "FOOTNOTE", "ENDNOTE", "PICTURE", "TABLE", "EQUATION", "TOTAL_PAGE" };
const page_positions = [_][]const u8{
    "NONE",         "TOP_LEFT",    "TOP_CENTER",     "TOP_RIGHT",  "BOTTOM_LEFT",   "BOTTOM_CENTER",
    "BOTTOM_RIGHT", "OUTSIDE_TOP", "OUTSIDE_BOTTOM", "INSIDE_TOP", "INSIDE_BOTTOM",
};

fn known(raw: []const u8, allowed: []const []const u8) bool {
    const normalized = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |name| if (std.mem.eql(u8, normalized, name)) return true;
    return false;
}

pub fn numberTypeKnown(raw: []const u8) bool {
    return known(raw, &number_types);
}

pub fn autoTypeKnown(raw: []const u8) bool {
    return known(raw, &auto_types);
}

pub fn pagePositionKnown(raw: []const u8) bool {
    return known(raw, &page_positions);
}
