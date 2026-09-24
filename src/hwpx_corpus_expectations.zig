// Test-only shard expectations from the independent Python ZIP/XML oracle.
// Keep shared census values here; the oracle remains an independent source.
pub const accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
pub const rejected_zip = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
pub const encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
pub const sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
// Independent tools/hwpx-table-oracle.py census of selected 2011 section XML.
pub const table_count = [_]usize{ 870, 364, 436, 361, 300, 421, 355, 1075 };
pub const table_rows = [_]usize{ 3699, 3758, 2398, 1859, 1879, 2489, 2386, 5240 };
pub const table_cells = [_]usize{ 15695, 10688, 11205, 7236, 13414, 10994, 17716, 20050 };
pub const table_grid_slots = [_]usize{ 27616, 28955, 20479, 12530, 18609, 19013, 23619, 36665 };
pub const table_cell_slots = table_grid_slots;
// Direct hp:tbl scalar census, independent of cell fields and grid dimensions.
pub const table_page_break_cell = [_]usize{ 710, 275, 318, 295, 188, 342, 290, 734 };
pub const table_page_break_none = [_]usize{ 153, 88, 117, 65, 112, 70, 63, 336 };
pub const table_page_break_table = [_]usize{ 7, 1, 1, 1, 0, 9, 2, 5 };
pub const table_repeat_header_true = [_]usize{ 832, 342, 398, 304, 295, 345, 337, 1064 };
pub const table_no_adjust_true = [_]usize{ 111, 62, 106, 46, 50, 81, 69, 150 };
pub const table_cell_spacing_zero = [_]usize{ 870, 364, 436, 361, 300, 421, 355, 1039 };
pub const table_cell_spacing_sum = [_]u64{ 0, 0, 0, 0, 0, 0, 0, 9066 };
pub const table_border_zero = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 5 };
pub const table_border_sum = [_]u64{ 4399, 2033, 4281, 4428, 3525, 3117, 3698, 70374 };
pub const table_border_missing_target = table_border_zero;
// Raw cellSz/cellMargin/hasMargin census from tools/hwpx-table-oracle.py.
// Field order is table_cell_fields.size_names and margin_names.
pub const table_has_margin_true = [_]usize{ 1653, 1427, 1320, 482, 5812, 2321, 1444, 1146 };
pub const table_zero_height = [_]usize{ 46, 87, 17, 1, 1, 2, 42, 86 };
pub const table_size_sums = [_][2]u64{
    .{ 142023574, 45133342 }, .{ 115235503, 40028381 }, .{ 99089655, 31594027 }, .{ 80483990, 21329471 },
    .{ 82373508, 26858618 },  .{ 103064823, 27647537 }, .{ 99458438, 29780614 }, .{ 206986421, 61260229 },
};
pub const table_margin_sums = [_][4]i64{
    .{ 910537488193, 910537421996, 910534975801, 910534999900 },
    .{ 558347828940, 558347885369, 558347254571, 558347280613 },
    .{ 824637686235, 816047807089, 833225130390, 820340228702 },
    .{ 3551940023526, 3560529916883, 3560528625758, 3560528620166 },
    .{ 1387276679378, 1387278971076, 1387276255162, 1387276247942 },
    .{ 10879154339597, 10071701147055, 11484743556944, 11484743548093 },
    .{ 41867343818571, 41639710639445, 41867342440014, 41867342437880 },
    .{ 691497324724, 816050103809, 803161633590, 717262657277 },
};
pub const table_margin_zero = [_][4]usize{
    .{ 2131, 2147, 2071, 2080 }, .{ 1011, 1038, 858, 864 },   .{ 777, 799, 773, 783 }, .{ 558, 558, 1116, 1123 },
    .{ 216, 237, 226, 244 },     .{ 2817, 1779, 2295, 2323 }, .{ 673, 523, 511, 512 }, .{ 1511, 1489, 1392, 1386 },
};
pub const table_margin_negative = [_][4]usize{
    .{ 0, 3, 3, 3 }, .{ 0, 3, 3, 3 }, @splat(0), @splat(0), @splat(0), @splat(0), @splat(0), @splat(0),
};
pub const table_margin_highbit = [_][4]usize{
    .{ 212, 212, 212, 212 }, .{ 130, 130, 130, 130 },     .{ 192, 190, 194, 191 },     .{ 827, 829, 829, 829 },
    .{ 323, 323, 323, 323 }, .{ 2533, 2345, 2674, 2674 }, .{ 9748, 9695, 9748, 9748 }, .{ 161, 190, 187, 167 },
};
// Direct hp:tc attributes, field order for booleans is table_cell_fields.flag_names.
pub const table_cell_name_absent = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 59 };
pub const table_cell_name_empty = [_]usize{ 14504, 9568, 10589, 6400, 12989, 10355, 17347, 19359 };
pub const table_cell_name_bytes = [_]u64{ 17547, 15498, 7762, 10666, 4251, 7390, 5361, 5860 };
pub const table_cell_flag_true = [_][4]usize{
    .{ 70, 34, 639, 0 }, .{ 404, 37, 274, 0 }, .{ 77, 15, 184, 0 },  .{ 42, 97, 354, 0 },
    .{ 4, 148, 123, 0 }, .{ 85, 5, 175, 36 },  .{ 178, 30, 111, 8 }, .{ 61, 77, 290, 36 },
};
pub const table_cell_border_sum = [_]u64{ 658079, 191413, 347715, 247895, 3319327, 1252296, 2772075, 2592952 };
// Direct table-cell hp:subList census from the independent ZIP/XML oracle.
pub const table_cell_sublist_direct_paragraphs = [_]usize{ 18932, 13738, 13208, 9173, 13989, 12640, 19096, 27328 };
pub const table_cell_sublist_id_absent = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 59 };
pub const table_cell_sublist_metatag_present = [_]usize{ 0, 1, 0, 11, 23, 15, 50, 0 };
pub const paragraphs = [_]usize{ 28740, 20865, 20019, 11680, 44679, 24829, 23614, 40720 };
pub const begin_present = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
// Raw minus selected section text: [paragraphs, runs, hp:t, UTF-8 bytes,
// inline elements], independently counted in hwpx-section-text-oracle.py.
pub const switch_removed_case = [_][5]usize{ @splat(0), @splat(0), @splat(0), .{ 2, 2, 2, 173, 0 }, @splat(0), @splat(0), @splat(0), @splat(0) };
pub const switch_removed_default = switch_removed_case;
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
// Master-page hp:p/hp:run link census from the independent ZIP/XML oracle.
pub const master_style_paragraphs = master_paragraphs;
pub const master_style_non_direct_paragraphs = [_]usize{ 72, 24, 107, 0, 0, 0, 18, 110 };
pub const master_style_runs = [_]usize{ 118, 39, 177, 0, 0, 0, 29, 158 };
pub const master_style_non_direct_runs = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_style_ref_present = [_][3]usize{
    .{ 86, 86, 118 }, .{ 31, 31, 39 },    .{ 126, 126, 177 },
    .{ 0, 0, 0 },     .{ 0, 0, 0 },       .{ 0, 0, 0 },
    .{ 21, 21, 29 },  .{ 130, 130, 158 },
};
pub const master_style_ref_resolved = master_style_ref_present;
pub const master_style_ref_absent = [_][3]usize{.{ 0, 0, 0 }} ** 8;
pub const master_style_ref_missing = master_style_ref_absent;
pub const master_style_ref_absent_table = master_style_ref_absent;
// [runs, missing charTcId, zero charTcId, paraTcId alias present,
//  alias only, equal dual IDs, conflicting dual IDs]
pub const section_run_metadata = [_][7]usize{
    .{ 38461, 38461, 0, 0, 0, 0, 0 }, .{ 25758, 25758, 0, 0, 0, 0, 0 },
    .{ 26965, 26965, 0, 0, 0, 0, 0 }, .{ 15293, 15293, 0, 0, 0, 0, 0 },
    .{ 47472, 47472, 0, 0, 0, 0, 0 }, .{ 29962, 29962, 0, 0, 0, 0, 0 },
    .{ 28564, 28564, 0, 0, 0, 0, 0 }, .{ 54872, 54872, 0, 0, 0, 0, 0 },
};
pub const master_run_metadata = [_][7]usize{
    .{ 118, 118, 0, 0, 0, 0, 0 }, .{ 39, 39, 0, 0, 0, 0, 0 },
    .{ 177, 177, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0, 0, 0 },     .{ 0, 0, 0, 0, 0, 0, 0 },
    .{ 29, 29, 0, 0, 0, 0, 0 },   .{ 158, 158, 0, 0, 0, 0, 0 },
};
// Run topology: [Hancom model, bookmark, switch, other 2011, foreign].
pub const section_run_topology_classes = [_][5]usize{
    .{ 38992, 2, 12, 0, 0 }, .{ 32773, 2, 14, 0, 0 },
    .{ 28449, 1, 15, 0, 0 }, .{ 13453, 1, 9, 0, 0 },
    .{ 45048, 1, 12, 0, 0 }, .{ 37090, 0, 10, 0, 0 },
    .{ 27676, 2, 12, 0, 0 }, .{ 46017, 0, 9, 0, 0 },
};
pub const master_run_topology_classes = [_][5]usize{
    .{ 123, 0, 0, 0, 0 }, .{ 61, 0, 0, 0, 0 },
    .{ 198, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 },   .{ 0, 0, 0, 0, 0 },
    .{ 43, 0, 0, 0, 0 },  .{ 208, 0, 0, 0, 0 },
};
// Direct hp:run/hp:switch shape; each observed case is chart and each default is OLE.
fn observedSwitchShape(comptime count: u64) [21]u64 {
    return .{ count, 0, count, count, 0, count, 0, count, 0, 0, 0, 0, 0, count, 0, count, 0, 0, 0, 0, 0 };
}
pub const section_switch_shape = [_][21]u64{
    observedSwitchShape(12), observedSwitchShape(14), observedSwitchShape(15), observedSwitchShape(9),
    observedSwitchShape(12), observedSwitchShape(10), observedSwitchShape(12), observedSwitchShape(9),
};
pub const master_switch_shape = [_][21]u64{[_]u64{0} ** 21} ** 8;
pub const section_run_topology_sec_pr = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
pub const section_run_topology_late_sec_pr = [_]usize{ 3, 3, 4, 1, 3, 3, 0, 15 };
pub const zero_run_topology = [_]usize{0} ** 8;
// Text node: [total, non-direct, missing charStyleIDRef, zero, over u32, child not in model].
pub const section_text_nodes = [_][6]usize{
    .{ 32422, 0, 32294, 0, 0, 0 }, .{ 25613, 0, 25612, 0, 0, 0 },
    .{ 23399, 0, 23285, 0, 0, 0 }, .{ 12239, 0, 12170, 0, 0, 0 },
    .{ 40502, 0, 40502, 0, 0, 0 }, .{ 28164, 0, 28161, 0, 0, 0 },
    .{ 25879, 0, 25829, 0, 0, 0 }, .{ 42459, 0, 42278, 0, 0, 0 },
};
pub const master_text_nodes = [_][6]usize{
    .{ 71, 0, 71, 0, 0, 0 },   .{ 33, 0, 33, 0, 0, 0 },
    .{ 114, 0, 114, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0, 0 },     .{ 0, 0, 0, 0, 0, 0 },
    .{ 24, 0, 24, 0, 0, 0 },   .{ 129, 0, 129, 0, 0, 0 },
};
// [Hancom model, 2011 XSD-only hyphen, other 2011, foreign].
pub const section_text_child_classes = [_][4]usize{
    .{ 1760, 0, 0, 0 }, .{ 2153, 0, 0, 0 },
    .{ 2003, 0, 0, 0 }, .{ 331, 0, 0, 0 },
    .{ 1647, 0, 0, 0 }, .{ 2862, 0, 0, 0 },
    .{ 671, 0, 0, 0 },  .{ 3828, 0, 0, 0 },
};
pub const master_text_child_classes = [_][4]usize{
    .{ 20, 0, 0, 0 }, .{ 9, 0, 0, 0 },
    .{ 31, 0, 0, 0 }, .{ 0, 0, 0, 0 },
    .{ 0, 0, 0, 0 },  .{ 0, 0, 0, 0 },
    .{ 9, 0, 0, 0 },  .{ 9, 0, 0, 0 },
};
// hp:tab direct-child fields; ordering is tab_attributes.Report.counts().
// Independent Python oracle emits the same 21 slots per shard.
pub const section_tab_fields = [_][21]u64{
    .{ 503, 503, 0, 0, 2331673, 503, 503, 0, 0, 0, 554, 0, 503, 503, 0, 0, 0, 0, 111, 0, 0 },
    .{ 1177, 1177, 0, 0, 4558766, 1177, 1177, 0, 0, 0, 873, 0, 1177, 1177, 0, 0, 0, 0, 135, 0, 0 },
    .{ 502, 502, 0, 0, 2434407, 502, 502, 0, 0, 0, 555, 0, 502, 502, 0, 0, 0, 0, 117, 0, 0 },
    .{ 141, 141, 0, 0, 2868721, 141, 141, 0, 0, 0, 260, 0, 141, 141, 0, 0, 0, 0, 309, 0, 0 },
    .{ 813, 813, 0, 0, 9303056, 813, 813, 0, 0, 0, 568, 0, 813, 813, 0, 0, 0, 0, 1035, 0, 0 },
    .{ 1783, 1783, 0, 0, 6027008, 1783, 1783, 0, 0, 0, 973, 0, 1783, 1783, 0, 0, 0, 0, 99, 0, 0 },
    .{ 370, 370, 0, 0, 4515192, 370, 370, 0, 0, 0, 500, 0, 370, 370, 0, 0, 0, 0, 72, 0, 0 },
    .{ 2293, 2293, 0, 0, 10303875, 2293, 2293, 0, 0, 0, 2404, 0, 2293, 2293, 0, 0, 0, 0, 462, 0, 0 },
};
pub const master_tab_fields = [_][21]u64{[_]u64{0} ** 21} ** 8;
// Direct hp:t annotation fields; order matches each attribute report's counts().
pub const section_markpen_fields = [_][9]u64{
    .{ 1, 1, 1, 0, 0, 16_777_215, 0, 1, 0 },
    .{ 2, 2, 2, 0, 0, 33_554_175, 0, 2, 0 },
    [_]u64{0} ** 9,
    [_]u64{0} ** 9,
    [_]u64{0} ** 9,
    .{ 2, 2, 2, 0, 0, 33_554_430, 0, 2, 0 },
    .{ 22, 22, 22, 0, 0, 369_098_730, 0, 26, 0 },
    [_]u64{0} ** 9,
};
pub const master_markpen_fields = [_][9]u64{[_]u64{0} ** 9} ** 8;
pub const section_title_mark_fields = [_][6]u64{
    .{ 1, 1, 1, 0, 0, 0 },
    .{ 61, 61, 61, 0, 0, 0 },
    [_]u64{0} ** 6,
    [_]u64{0} ** 6,
    .{ 305, 305, 305, 0, 0, 0 },
    [_]u64{0} ** 6,
    [_]u64{0} ** 6,
    [_]u64{0} ** 6,
};
pub const master_title_mark_fields = [_][6]u64{[_]u64{0} ** 6} ** 8;
pub const section_track_change_tag_fields = [_][20]u64{[_]u64{0} ** 20} ** 8;
pub const master_track_change_tag_fields = [_][20]u64{[_]u64{0} ** 20} ** 8;
pub const master_page_number_sum = [_]u64{ 0, 0, 4, 0, 0, 0, 0, 0 };
pub const master_page_count_declarations = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
pub const master_page_type_counts = [_][5]usize{
    .{ 1, 6, 6, 1, 0 }, .{ 1, 2, 2, 1, 0 }, .{ 0, 8, 8, 2, 1 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 0, 1, 1, 1, 0 }, .{ 1, 4, 13, 1, 0 },
};
