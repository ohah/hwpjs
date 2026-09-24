// Test-only shard expectations from the independent Python ZIP/XML oracle.
// Keep shared census values here; the oracle remains an independent source.
pub const accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
pub const rejected_zip = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
pub const encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
pub const sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
pub const paragraphs = [_]usize{ 28740, 20865, 20019, 11680, 44679, 24829, 23614, 40720 };
pub const begin_present = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
// OPF application/xml census from tools/hwpx-manifest-xml-oracle.py.
pub const manifest_xml_entries = [_]usize{ 213, 210, 200, 150, 183, 178, 178, 224 };
pub const manifest_xml_bytes = [_]usize{ 34_898_756, 26_622_158, 26_901_093, 15_149_032, 35_375_005, 31_716_373, 28_854_349, 47_023_837 };
pub const manifest_xml_elements = [_]usize{ 478_758, 357_297, 371_323, 215_713, 477_503, 431_955, 400_730, 651_235 };
pub const manifest_xml_settings = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
pub const manifest_xml_masterpages = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
// settings.xml census and value sums from tools/hwpx-manifest-xml-oracle.py.
pub const settings_carets = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
pub const settings_caret_pos_sum = [_]u64{ 1494, 1202, 982, 666, 1579, 681, 1365, 1147 };
pub const settings_config_sets = [_]usize{ 17, 12, 13, 11, 12, 13, 12, 14 };
pub const settings_config_items = [_]usize{ 134, 93, 102, 88, 94, 98, 96, 111 };
pub const settings_short_sum = [_]i64{ 3408, 2401, 2605, 2208, 2408, 2600, 2408, 2804 };
pub const settings_boolean_true = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const settings_unsupported_types = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
// Master-page package roots and section links from the independent ZIP/XML oracle.
pub const master_page_refs = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
pub const master_page_sub_lists = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
pub const master_sub_list_direct_paragraphs = [_]usize{ 14, 7, 19, 0, 0, 0, 3, 20 };
// 11 fields in para_list_attributes.Field order. The final metatag is absent.
pub const master_sub_list_attribute_presence = [_][11]usize{
    .{ 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 0 },
    .{ 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0 },
    .{ 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 0 },
    @splat(0),
    @splat(0),
    @splat(0),
    .{ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0 },
    .{ 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 0 },
};
pub const master_sub_list_unknown_enums = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_sub_list_other_attributes = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_sub_list_width_sum = [_]u64{ 630706, 399342, 982188, 0, 0, 0, 199836, 947462 };
pub const master_sub_list_height_sum = [_]u64{ 1015820, 545946, 1489464, 0, 0, 0, 272538, 1142649 };
// All hp:p descendants of root-direct master-page subLists, not only direct p.
pub const master_paragraphs = [_]usize{ 86, 31, 126, 0, 0, 0, 21, 130 };
pub const master_paragraph_missing_id = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_paragraph_zero_id = [_]usize{ 11, 3, 20, 0, 0, 0, 0, 35 };
pub const master_paragraph_missing_tc_id = master_paragraphs;
// pageBreak, columnBreak, merged present counts from the independent oracle.
pub const master_paragraph_boolean_present = [_][3]usize{
    .{ 86, 86, 86 }, .{ 31, 31, 31 },    .{ 126, 126, 126 },
    .{ 0, 0, 0 },    .{ 0, 0, 0 },       .{ 0, 0, 0 },
    .{ 21, 21, 21 }, .{ 130, 130, 130 },
};
pub const master_paragraph_page_break_true = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_paragraph_column_break_true = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_paragraph_merged_true = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_page_number_sum = [_]u64{ 0, 0, 4, 0, 0, 0, 0, 0 };
pub const master_page_count_declarations = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
pub const master_page_type_counts = [_][5]usize{
    .{ 1, 6, 6, 1, 0 }, .{ 1, 2, 2, 1, 0 }, .{ 0, 8, 8, 2, 1 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 0, 1, 1, 1, 0 }, .{ 1, 4, 13, 1, 0 },
};
