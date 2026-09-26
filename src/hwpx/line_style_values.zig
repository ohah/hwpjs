const std = @import("std");
const values = @import("xml_values.zig");

// Hancom OWPML enumdef.h g_LineTypeList2 and g_LineWithList.
const line_types = [_][]const u8{
    "NONE",        "SOLID",      "DOT",        "DASH",            "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE",
    "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE",     "DOUBLEWAVE",   "THICK3D",   "THICKREV3D",
    "3D",          "REV3D",
};
const widths = [_][]const u8{
    "0.1 mm", "0.12 mm", "0.15 mm", "0.2 mm", "0.25 mm", "0.3 mm", "0.4 mm", "0.5 mm",
    "0.6 mm", "0.7 mm",  "1.0 mm",  "1.5 mm", "2.0 mm",  "3.0 mm", "4.0 mm", "5.0 mm",
};

fn xmlSpace(byte: u8) bool {
    return byte == ' ' or byte == '\t' or byte == '\r' or byte == '\n';
}

fn collapsedEquals(raw: []const u8, expected: []const u8) bool {
    var input: usize = 0;
    var output: usize = 0;
    while (input < raw.len and xmlSpace(raw[input])) : (input += 1) {}
    while (input < raw.len) {
        if (xmlSpace(raw[input])) {
            while (input < raw.len and xmlSpace(raw[input])) : (input += 1) {}
            if (input == raw.len) break;
            if (output == expected.len or expected[output] != ' ') return false;
            output += 1;
        } else {
            if (output == expected.len or expected[output] != raw[input]) return false;
            output += 1;
            input += 1;
        }
    }
    return output == expected.len;
}

pub fn knownType(raw: []const u8) bool {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    for (line_types) |name| if (std.mem.eql(u8, trimmed, name)) return true;
    return false;
}

pub fn knownWidth(raw: []const u8) bool {
    for (widths) |name| if (collapsedEquals(raw, name)) return true;
    return false;
}

pub fn canonicalColor(raw: []const u8) bool {
    return values.sixHexColor(raw);
}
