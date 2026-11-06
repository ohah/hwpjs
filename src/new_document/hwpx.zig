//! Deterministic, memory-only, authored empty HWPX document.
//! Caller owns the returned ZIP bytes and frees them with the same allocator.
//! XML vocabulary/order follows the local OWPML Header/ParaList schemas.
const std = @import("std");
const attribute_writer = @import("../xml/attribute_writer.zig");
const defaults = @import("defaults.zig");
const zip_store = @import("../zip/store_writer.zig");

/// A4 portrait; one empty paragraph; Korean Normal style; 11pt 함초롬바탕.
/// No template, user metadata, clock, filesystem, or external resources.
pub fn create(a: std.mem.Allocator) ![]u8 {
    const font = try attribute_writer.encode(a, defaults.font_name, 128);
    defer a.free(font);
    var header: std.ArrayList(u8) = .empty;
    defer header.deinit(a);
    try header.appendSlice(a, header_prefix);
    for (defaults.font_languages) |lang| {
        try header.appendSlice(a, "<hh:fontface lang=\"");
        try header.appendSlice(a, lang);
        try header.appendSlice(a, "\" fontCnt=\"1\"><hh:font id=\"0\" face=\"");
        try header.appendSlice(a, font);
        try header.appendSlice(a, "\" type=\"TTF\" isEmbedded=\"0\"/></hh:fontface>");
    }
    try header.appendSlice(a, header_suffix);
    return zip_store.write(a, &.{
        .{ .name = "mimetype", .bytes = "application/hwp+zip" },
        .{ .name = "version.xml", .bytes = version },
        .{ .name = "META-INF/container.xml", .bytes = container },
        .{ .name = "Contents/content.hpf", .bytes = manifest },
        .{ .name = "Contents/header.xml", .bytes = header.items },
        .{ .name = "Contents/section0.xml", .bytes = section },
        .{ .name = "settings.xml", .bytes = settings },
    }, .{});
}

const declaration = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

const version = @import("../model/authored_hwpx_profile.zig").version_xml;

const container = declaration ++
    "<container xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">" ++
    "<rootfiles>" ++
    "<rootfile full-path=\"Contents/content.hpf\" media-type=\"application/hwpml-package+xml\"/>" ++
    "</rootfiles>" ++
    "</container>";

const manifest = declaration ++
    "<opf:package xmlns:opf=\"http://www.idpf.org/2007/opf/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" version=\"3.0\" unique-identifier=\"document-id\">" ++
    "<opf:metadata>" ++
    "<dc:identifier id=\"document-id\">urn:hwpjs:document:empty</dc:identifier>" ++
    "<dc:language>" ++ defaults.locale ++ "</dc:language>" ++
    "</opf:metadata>" ++
    "<opf:manifest>" ++
    "<opf:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<opf:item id=\"section0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
    "<opf:item id=\"settings\" href=\"settings.xml\" media-type=\"application/xml\"/>" ++
    "</opf:manifest>" ++
    "<opf:spine>" ++
    "<opf:itemref idref=\"header\"/>" ++
    "<opf:itemref idref=\"section0\"/>" ++
    "</opf:spine>" ++
    "</opf:package>";

const header_prefix = declaration ++
    "<hh:head xmlns:hh=\"http://www.hancom.co.kr/hwpml/2011/head\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" version=\"1.5\" secCnt=\"1\">" ++
    std.fmt.comptimePrint("<hh:beginNum page=\"{0d}\" footnote=\"{0d}\" endnote=\"{0d}\" pic=\"{0d}\" tbl=\"{0d}\" equation=\"{0d}\"/>", .{defaults.first_number}) ++
    "<hh:refList>" ++
    "<hh:fontfaces itemCnt=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_languages.len}) ++ "\">";

const header_suffix =
    "</hh:fontfaces>" ++
    "<hh:borderFills itemCnt=\"1\">" ++
    "<hh:borderFill id=\"1\" threeD=\"0\" shadow=\"0\" centerLine=\"NONE\" breakCellSeparateLine=\"0\">" ++
    "<hh:leftBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/>" ++
    "<hh:rightBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/>" ++
    "<hh:topBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/>" ++
    "<hh:bottomBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/>" ++
    "</hh:borderFill>" ++
    "</hh:borderFills>" ++
    "<hh:charProperties itemCnt=\"1\">" ++
    "<hh:charPr id=\"0\" height=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_height}) ++ "\" textColor=\"#000000\" shadeColor=\"#FFFFFF\" useFontSpace=\"0\" useKerning=\"0\" symMark=\"NONE\" borderFillIDRef=\"1\">" ++
    "<hh:fontRef hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/>" ++
    "<hh:ratio hangul=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" latin=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" hanja=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" japanese=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" other=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" symbol=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" user=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\"/>" ++
    "<hh:spacing hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/>" ++
    "<hh:relSz hangul=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" latin=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" hanja=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" japanese=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" other=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" symbol=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\" user=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.font_scale}) ++ "\"/>" ++
    "<hh:offset hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/>" ++
    "</hh:charPr>" ++
    "</hh:charProperties>" ++
    "<hh:tabProperties itemCnt=\"1\">" ++
    "<hh:tabPr id=\"0\" autoTabLeft=\"0\" autoTabRight=\"0\"/>" ++
    "</hh:tabProperties>" ++
    "<hh:paraProperties itemCnt=\"1\">" ++
    "<hh:paraPr id=\"0\" tabPrIDRef=\"0\" condense=\"0\" fontLineHeight=\"0\" snapToGrid=\"1\" suppressLineNumbers=\"0\" checked=\"0\">" ++
    "<hh:align horizontal=\"" ++ (switch (defaults.alignment) {
        .left => "LEFT",
    }) ++ "\" vertical=\"BASELINE\"/>" ++
    "<hh:heading type=\"NONE\" idRef=\"0\" level=\"0\"/>" ++
    "<hh:breakSetting breakLatinWord=\"KEEP_WORD\" breakNonLatinWord=\"BREAK_WORD\" widowOrphan=\"0\" keepWithNext=\"0\" keepLines=\"0\" pageBreakBefore=\"0\" lineWrap=\"BREAK\"/>" ++
    "<hh:margin>" ++
    "<hc:intent value=\"0\" unit=\"HWPUNIT\"/>" ++
    "<hc:left value=\"0\" unit=\"HWPUNIT\"/>" ++
    "<hc:right value=\"0\" unit=\"HWPUNIT\"/>" ++
    "<hc:prev value=\"0\" unit=\"HWPUNIT\"/>" ++
    "<hc:next value=\"0\" unit=\"HWPUNIT\"/>" ++
    "</hh:margin>" ++
    "<hh:lineSpacing type=\"PERCENT\" value=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.line_spacing}) ++ "\" unit=\"HWPUNIT\"/>" ++
    "<hh:border borderFillIDRef=\"1\" offsetLeft=\"0\" offsetRight=\"0\" offsetTop=\"0\" offsetBottom=\"0\" connect=\"0\" ignoreMargin=\"0\"/>" ++
    "<hh:autoSpacing eAsianEng=\"0\" eAsianNum=\"0\"/>" ++
    "</hh:paraPr>" ++
    "</hh:paraProperties>" ++
    "<hh:styles itemCnt=\"1\">" ++
    "<hh:style id=\"0\" type=\"PARA\" name=\"" ++ defaults.style_name ++ "\" engName=\"" ++ defaults.style_english_name ++ "\" paraPrIDRef=\"0\" charPrIDRef=\"0\" nextStyleIDRef=\"0\" langID=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.language_id}) ++ "\"/>" ++
    "</hh:styles>" ++
    "</hh:refList>" ++
    "<hh:trackchangeConfig flags=\"0\"/>" ++
    "</hh:head>";

const section = declaration ++
    "<hs:sec xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\">" ++
    "<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\">" ++
    "<hp:run charPrIDRef=\"0\">" ++
    "<hp:secPr id=\"0\" textDirection=\"HORIZONTAL\" spaceColumns=\"0\" tabStopVal=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.tab_spacing}) ++ "\" tabStopUnit=\"HWPUNIT\" textVerticalWidthHead=\"0\" masterPageCnt=\"0\">" ++
    std.fmt.comptimePrint("<hp:startNum pageStartsOn=\"BOTH\" page=\"{0d}\" pic=\"{0d}\" tbl=\"{0d}\" equation=\"{0d}\"/>", .{defaults.first_number}) ++
    "<hp:grid lineGrid=\"0\" charGrid=\"0\" wonggojiFormat=\"0\"/>" ++
    "<hp:visibility hideFirstHeader=\"0\" hideFirstFooter=\"0\" hideFirstMasterPage=\"0\" border=\"SHOW_ALL\" fill=\"SHOW_ALL\" hideFirstPageNum=\"0\" hideFirstEmptyLine=\"0\" showLineNumber=\"0\"/>" ++
    "<hp:pagePr landscape=\"NARROWLY\" width=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_width}) ++ "\" height=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_height}) ++ "\" gutterType=\"LEFT_ONLY\">" ++
    "<hp:margin left=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_margin}) ++ "\" right=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_margin}) ++ "\" top=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_margin}) ++ "\" bottom=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.page_margin}) ++ "\" header=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.header_footer_margin}) ++ "\" footer=\"" ++ std.fmt.comptimePrint("{d}", .{defaults.header_footer_margin}) ++ "\" gutter=\"0\"/>" ++
    "</hp:pagePr>" ++
    "</hp:secPr>" ++
    "<hp:ctrl>" ++
    "<hp:colPr id=\"0\" type=\"NEWSPAPER\" layout=\"LEFT\" colCount=\"1\" sameSz=\"1\" sameGap=\"0\"/>" ++
    "</hp:ctrl>" ++
    "<hp:t/>" ++
    "</hp:run>" ++
    "</hp:p>" ++
    "</hs:sec>";

const settings = declaration ++
    "<ha:HWPApplicationSetting xmlns:ha=\"http://www.hancom.co.kr/hwpml/2011/app\">" ++
    "<ha:CaretPosition listIDRef=\"0\" paraIDRef=\"0\" pos=\"0\"/>" ++
    "</ha:HWPApplicationSetting>";
