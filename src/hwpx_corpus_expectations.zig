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
// Independent tools/hwpx-table-oracle.py master_shards; root-direct hp:subList scope.
pub const master_table_parts = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
pub const master_table_sub_lists = master_table_parts;
pub const master_table_xml_bytes = [_]usize{ 119982, 47471, 183012, 0, 0, 0, 32959, 194651 };
pub const master_table_elements = [_]usize{ 1477, 584, 2305, 0, 0, 0, 433, 2547 };
pub const master_table_count = [_]usize{ 12, 7, 20, 0, 0, 0, 4, 5 };
pub const master_table_rows = [_]usize{ 24, 7, 32, 0, 0, 0, 4, 5 };
pub const master_table_cells = [_]usize{ 50, 13, 70, 0, 0, 0, 10, 11 };
pub const master_table_grid_slots = [_]usize{ 62, 13, 82, 0, 0, 0, 10, 11 };
pub const master_table_labels = [_]usize{ 8, 0, 8, 0, 0, 0, 0, 0 };
pub const master_table_id_sum = [_]i64{ 15179204244, 10163635143, 27723221221, 0, 0, 0, 4383869806, 5479837450 };
pub const master_table_width_sum = [_]i64{ 685108, 246902, 1148276, 0, 0, 0, 231596, 236698 };
pub const master_table_cell_width_sum = [_]u64{ 1140408, 246902, 1603576, 0, 0, 0, 231596, 236698 };
pub const master_table_cell_paragraphs = [_]usize{ 59, 21, 88, 0, 0, 0, 15, 17 };
pub const master_table_inside_left_sum = [_]i64{ 0, 849, 0, 0, 0, 0, 0, 283 };
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
// Direct hp:tbl inMargin and cellzoneList/cellzone census.
pub const table_inside_margin_sum = [_][4]i64{
    .{ 212501, 212500, 97559, 97559 }, .{ 106873, 106873, 68149, 68005 },
    .{ 105253, 105480, 53449, 53449 }, .{ 119043, 119043, 63776, 63776 },
    .{ 63081, 64082, 35979, 35979 },   .{ 153488, 153914, 70875, 70449 },
    .{ 107747, 108199, 46144, 46144 }, .{ 231049, 231050, 136257, 136257 },
};
pub const table_inside_margin_zero = [_][4]usize{
    .{ 226, 226, 211, 211 }, .{ 76, 76, 56, 56 }, .{ 96, 96, 85, 85 }, .{ 50, 50, 37, 37 },
    .{ 26, 26, 26, 26 },     .{ 51, 51, 53, 53 }, .{ 54, 52, 40, 40 }, .{ 236, 236, 236, 236 },
};
pub const table_zone_lists = [_]usize{ 12, 7, 9, 9, 8, 20, 9, 25 };
pub const table_zones = [_]usize{ 16, 7, 14, 10, 16, 26, 16, 25 };
pub const table_zone_coordinate_sum = [_][4]u64{
    .{ 40, 6, 84, 49 },   .{ 4, 4, 13, 46 },  .{ 17, 8, 32, 23 },  .{ 11, 17, 33, 65 },
    .{ 94, 40, 148, 92 }, .{ 36, 6, 40, 47 }, .{ 71, 50, 93, 72 }, .{ 21, 0, 31, 51 },
};
pub const table_zone_border_sum = [_]u64{ 863, 38, 683, 171, 908, 1605, 921, 633 };
// Independent ZIP/ElementTree census of hp:tbl inherited shape fields.
pub const table_shape_captions = [_]usize{ 31, 5, 5, 7, 10, 7, 42, 27 };
pub const table_shape_labels = [_]usize{ 8, 0, 11, 0, 0, 2, 3, 4 };
// All observed cells start their known-child sequence with subList; only shard 7 has trailing cellAddr.
pub const table_cell_last_known_address = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 59 };
pub const table_shape_dropcap_present = [_]usize{ 870, 364, 436, 361, 300, 421, 355, 1070 };
// All five extensions in this corpus are THROUGH; no TIGHT was observed.
pub const table_shape_wrap_extensions = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 5 };
pub const table_shape_caption_paragraphs = [_]usize{ 34, 8, 6, 10, 13, 8, 45, 27 };
pub const table_shape_id_sum = [_]i64{ 1341475469557, 603530828261, 640060565692, 592151807521, 491681456877, 689659156721, 600119920046, 1791433675581 };
pub const table_shape_size_width_sum = [_]i64{ 32999013, 14388484, 18056208, 15916367, 11740598, 18042493, 15051717, 41922443 };
pub const table_shape_size_height_sum = [_]i64{ 13653757, 6772092, 8340021, 7116872, 5231631, 8055113, 6745834, 17941895 };
pub const table_shape_vert_offset_sum = [_]i64{ 8591168340, 80135, 8590210164, 4295067718, 8589953226, 17179952194, 21474913281, 21475238679 };
pub const table_shape_horz_offset_sum = [_]i64{ 4295594224, 4295101158, 4295076720, 4295103091, 4295006482, 12884971312, 30064882848, 8591401346 };
pub const table_shape_vert_offset_negative = [_]usize{ 0, 0, 1, 0, 0, 0, 0, 0 };
pub const table_shape_vert_offset_highbit = [_]usize{ 2, 0, 2, 1, 2, 4, 5, 5 };
pub const table_shape_horz_offset_highbit = [_]usize{ 1, 1, 1, 1, 1, 3, 7, 2 };
pub const table_shape_outer_margin_sum = [_][4]i64{
    .{ 123134, 124266, 130495, 137746 }, .{ 49867, 51000, 54340, 62310 },
    .{ 61628, 62476, 67285, 95363 },     .{ 39512, 39512, 46589, 53429 },
    .{ 50625, 50625, 49645, 54208 },     .{ 59695, 59695, 67905, 71631 },
    .{ 68226, 68366, 67657, 73419 },     .{ 175337, 147703, 152586, 181636 },
};
pub const table_shape_caption_width_sum = [_]i64{ 263624, 42520, 42520, 59529, 85040, 59528, 357168, 229608 };
pub const table_shape_label_pagewidth_sum = [_]i64{ 476224, 0, 654808, 0, 0, 119056, 178584, 238112 };
pub const table_shape_label_pageheight_sum = [_]i64{ 673504, 0, 926068, 0, 0, 168376, 252564, 336752 };
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
// Independent tools/hwpx-section-text-oracle.py direct PType child census.
pub const paragraph_direct_runs = [_]usize{ 38461, 25758, 26965, 15293, 47472, 29962, 28564, 54872 };
pub const paragraph_line_seg_arrays = [_]usize{ 28651, 20745, 19968, 11551, 44611, 24744, 23523, 40112 };
pub const paragraph_without_runs = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 1 };
pub const paragraph_without_line_seg_array = [_]usize{ 89, 120, 51, 129, 68, 85, 91, 608 };
// Independent tools/hwpx-section-text-oracle.py direct linesegarray/lineseg census.
pub const line_segment_count = [_]usize{ 33498, 25558, 24047, 13970, 49575, 28300, 28181, 51351 };
pub const line_segment_empty_arrays = [_]usize{ 0, 0, 0, 0, 0, 0, 6, 0 };
pub const line_segment_flags_highbit = [_]usize{ 3980, 1810, 0, 0, 0, 0, 0, 0 };
pub const line_segment_spacing_negative = [_]usize{ 367, 86, 118, 26, 100, 83, 539, 341 };
pub const line_segment_horzpos_negative = [_]usize{ 19, 81, 5, 10, 17, 15, 10, 46 };
pub const line_segment_field_sums = [_][9]i64{
    .{ 452626, 406942239, 37837372, 37712948, 30531114, 12038704, 5534737, 702337142, 8562911215616 },
    .{ 547422, 316205401, 30673574, 30533880, 25316459, 13035699, 3021274, 536808045, 3899844132864 },
    .{ 337349, 341327705, 33104836, 32984105, 26654688, 12282840, 3865916, 519064868, 12359172096 },
    .{ 238106, 154816160, 20580404, 20541732, 17325596, 7922396, 1747012, 343304370, 7246446592 },
    .{ 626348, 1049249316, 54929943, 54896065, 46120588, 24388392, 2277041, 1552924966, 20268187648 },
    .{ 342238, 445431401, 38167562, 38026351, 31578018, 13421552, 2227002, 734973263, 13222871040 },
    .{ 567834, 248623564, 32576803, 32550129, 24623728, 10624584, 2285935, 511138530, 14605418496 },
    .{ 908456, 833867989, 72317861, 72278821, 60076768, 25997613, 34147114, 1422689887, 29698818048 },
};
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
// Independent direct child census under root-direct master-page subLists.
pub const master_paragraph_direct_runs = [_]usize{ 118, 39, 177, 0, 0, 0, 29, 158 };
// Independent root-direct subList/descendant p/direct linesegarray census.
pub const master_line_paragraphs = [_]usize{ 86, 31, 126, 0, 0, 0, 21, 130 };
pub const master_line_segments = [_]usize{ 88, 33, 131, 0, 0, 0, 23, 143 };
pub const master_line_spacing_negative = [_]usize{ 7, 9, 13, 0, 0, 0, 3, 7 };
pub const master_line_field_sums = [_][9]i64{
    .{ 73, 37696, 100845, 100845, 85717, 33136, 5150, 2378422, 36700160 },
    .{ 73, 35776, 65245, 65245, 55463, 13136, 5150, 925634, 15073280 },
    .{ 182, 85324, 205135, 205135, 174363, 59904, 13450, 3484502, 56754176 },
    @splat(0),
    @splat(0),
    @splat(0),
    .{ 73, 32096, 53745, 53745, 45683, 14056, 5150, 632418, 11141120 },
    .{ 105, 276644, 168545, 168545, 143265, 50376, 13150, 2015578, 58327040 },
};
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
// Independent ElementTree oracle: paragraphs, runs, hp:t, empty hp:t, UTF-8 bytes.
pub const master_text_content = [_][5]usize{
    .{ 86, 118, 71, 38, 641 },    .{ 31, 39, 33, 20, 274 },
    .{ 126, 177, 114, 53, 1164 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 },           .{ 0, 0, 0, 0, 0 },
    .{ 21, 29, 24, 14, 268 },     .{ 130, 158, 129, 40, 933 },
};
pub const master_text_digest_sum = [_]u64{
    3454785851527485364, 13920564907367095401, 11283306605575013755, 0,
    0,                   0,                    5992471676250238163,  14003655075739860585,
};
// Three groups of [sites, absent, empty, embedded, external, missing], then
// unclassified attributes, from the independent OPF/ElementTree oracle.
pub const master_binary = [_][19]usize{
    .{ 4, 0, 0, 4, 0, 0 } ++ .{0} ** 13,
    .{ 3, 0, 0, 3, 0, 0 } ++ .{0} ** 13,
    .{ 10, 0, 0, 10, 0, 0 } ++ .{0} ** 13,
    .{0} ** 19,
    .{0} ** 19,
    .{0} ** 19,
    .{ 3, 0, 0, 3, 0, 0 } ++ .{0} ** 13,
    .{ 15, 0, 0, 15, 0, 0 } ++ .{0} ** 13,
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
// Independent Python zipfile/ElementTree survey of direct 2011 secPr/pagePr.
// Same two roots and UTF-8 relative-path shard rule as hwpx_known_survey.zig.
pub const page_geometry_pages = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
pub const page_geometry_widely = [_]usize{ 75, 71, 70, 53, 62, 61, 63, 89 };
pub const page_geometry_left_right = [_]usize{ 5, 2, 5, 0, 0, 0, 0, 11 };
pub const page_geometry_width_sum = [_]u64{ 4_489_254, 4_345_823, 4_359_991, 3_274_040, 3_809_792, 3_690_736, 3_774_924, 5_462_964 };
pub const page_geometry_height_sum = [_]u64{ 6_348_935, 6_151_349, 6_166_090, 4_630_305, 5_387_991, 5_219_608, 5_338_654, 7_683_737 };
// Field order: header, footer, gutter, left, right, top, bottom.
pub const page_geometry_margin_sum = [_][7]u64{
    .{ 220_262, 215_302, 0, 483_513, 510_990, 357_494, 296_874 },
    .{ 217_738, 203_491, 0, 490_169, 479_285, 377_255, 296_125 },
    .{ 219_417, 220_696, 0, 500_583, 528_938, 389_697, 304_989 },
    .{ 163_774, 158_391, 0, 370_472, 360_560, 261_985, 216_665 },
    .{ 211_986, 201_733, 0, 441_436, 431_995, 317_559, 255_178 },
    .{ 183_031, 170_275, 2_268, 412_707, 402_795, 308_350, 247_172 },
    .{ 192_717, 201_080, 0, 429_437, 423_773, 322_774, 256_773 },
    .{ 254_404, 247_881, 0, 614_381, 597_741, 458_174, 366_345 },
};
// Independent section-definition oracle. Numeric order: spaceColumns,
// tabStop, tabStopVal, outlineShapeIDRef, memoShapeIDRef, masterPageCnt.
pub const section_definition_count = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
// Independent tools/hwpx-section-direct-settings-oracle.py census. Kind order:
// startNum, grid, visibility, lineNumberShape. Boolean order: first header,
// first footer, first master page, first page number, first empty line, line number.
pub const section_setting_counts = [_][4]usize{
    .{ 75, 75, 75, 75 }, .{ 72, 72, 72, 72 }, .{ 72, 72, 72, 72 }, .{ 55, 55, 55, 55 },
    .{ 64, 64, 64, 64 }, .{ 62, 62, 62, 62 }, .{ 63, 63, 63, 63 }, .{ 92, 92, 92, 91 },
};
pub const section_setting_extensions = [_]usize{ 4, 4, 3, 1, 3, 2, 4, 0 };
pub const section_setting_start_odd = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 1 };
pub const section_setting_start_page_sum = [_]u64{ 0, 0, 0, 0, 0, 0, 0, 1 };
pub const section_setting_fill_show_first = [_]usize{ 0, 1, 0, 0, 0, 0, 0, 1 };
pub const section_setting_visibility_true = [_][6]usize{
    .{ 0, 0, 1, 0, 1, 0 }, .{ 0, 0, 1, 0, 0, 0 }, .{ 0, 0, 1, 0, 3, 0 }, .{ 0, 0, 0, 0, 0, 0 },
    .{ 2, 2, 0, 0, 2, 0 }, .{ 1, 0, 0, 1, 3, 0 }, .{ 0, 0, 1, 0, 0, 0 }, .{ 0, 0, 1, 0, 14, 0 },
};
// Independent tools/hwpx-section-page-border-oracle.py census. Type order:
// BOTH, EVEN, ODD. Offset sum order: left, right, top, bottom.
pub const section_page_border_count = [_]usize{ 217, 206, 210, 163, 186, 178, 181, 274 };
pub const section_page_border_types = [_][3]usize{
    .{ 75, 71, 71 }, .{ 72, 67, 67 }, .{ 72, 69, 69 }, .{ 55, 54, 54 },
    .{ 64, 61, 61 }, .{ 62, 58, 58 }, .{ 63, 59, 59 }, .{ 112, 81, 81 },
};
pub const section_page_border_id_sum = [_]u64{ 283, 222, 766, 341, 379, 739, 183, 1572 };
pub const section_page_border_id_zero = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 30 };
// Independent oracle resolves every present ID against header borderFills;
// 30 observed zero IDs are missing targets, not implicit sentinels.
pub const section_page_border_refs_resolved = [_]usize{ 217, 206, 210, 163, 186, 178, 181, 244 };
pub const section_page_border_refs_missing_target = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 30 };
pub const section_page_border_content = [_]usize{ 4, 4, 3, 1, 2, 5, 0, 0 };
pub const section_page_border_inside = [_]usize{ 1, 1, 1, 1, 0, 1, 0, 0 };
pub const section_page_border_offset_sums = [_][4]u64{
    .{ 305_789, 305_789, 313_159, 305_789 },
    .{ 292_189, 292_189, 303_244, 292_189 },
    .{ 290_202, 290_202, 297_572, 290_202 },
    .{ 225_303, 225_303, 225_303, 225_303 },
    .{ 263_279, 263_279, 270_649, 263_279 },
    .{ 248_824, 248_824, 263_564, 248_824 },
    .{ 253_643, 253_643, 253_643, 253_643 },
    .{ 333_001, 333_001, 333_001, 333_001 },
};
// Independent tools/hwpx-section-note-shapes-oracle.py census. Note order:
// foot, end. Spacing order: foot between/below/above, end between/below/above.
// Character order: foot user/prefix/suffix, end user/prefix/suffix.
pub const section_note_counts = [_][2]usize{
    .{ 75, 75 }, .{ 71, 71 }, .{ 72, 72 }, .{ 55, 55 },
    .{ 64, 64 }, .{ 60, 60 }, .{ 63, 63 }, .{ 91, 91 },
};
pub const section_note_line_length_sums = [_][2]i64{
    .{ -75, 602_485_526 }, .{ -71, 573_114_964 }, .{ -72, 617_150_860 }, .{ -55, 499_554_375 },
    .{ -64, 543_689_134 }, .{ -60, 514_303_935 }, .{ -63, 558_368_079 }, .{ -91, 470_167_263 },
};
pub const section_note_spacing_sums = [_][6]u64{
    .{ 28_043, 42_537, 58_676, 14_168, 42_649, 58_194 },
    .{ 24_079, 40_274, 55_847, 10_201, 41_242, 57_940 },
    .{ 26_063, 40_841, 56_700, 12_468, 46_070, 56_880 },
    .{ 18_421, 31_190, 45_361, 4_250, 31_294, 45_517 },
    .{ 22_662, 36_302, 50_460, 10_768, 36_414, 56_273 },
    .{ 19_268, 34_036, 46_496, 16_722, 49_449, 63_671 },
    .{ 23_507, 35_729, 50_736, 8_500, 35_793, 50_832 },
    .{ 29_195, 45_962, 65_807, 9_350, 46_242, 65_601 },
};
pub const section_note_new_num_sums = [_][2]u64{
    .{ 75, 75 }, .{ 71, 71 }, .{ 10_948, 10_952 }, .{ 55, 55 },
    .{ 64, 64 }, .{ 60, 60 }, .{ 2_782, 2_783 },   .{ 2_810, 2_811 },
};
pub const section_note_supscript_true = [_][2]usize{
    .{ 0, 0 }, .{ 0, 0 }, .{ 0, 0 }, .{ 0, 0 },
    .{ 0, 0 }, .{ 0, 0 }, .{ 0, 0 }, .{ 11, 10 },
};
// Anomalies: unknown enum count, noncanonical color, foot width "4 mm",
// end width "4 mm", end placement EACH_COLUMN.
pub const section_note_anomalies = [_][5]usize{
    .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 0, 8, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 30, 0, 10, 10, 10 },
};
pub const section_note_missing_chars = [_][6]usize{
    .{ 0, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 }, .{ 10, 10, 10, 10, 10, 10 },
};
pub const section_note_nonempty_chars = [_][6]usize{
    .{ 0, 0, 75, 0, 2, 75 }, .{ 0, 0, 71, 0, 3, 71 },
    .{ 0, 0, 72, 0, 2, 72 }, .{ 0, 0, 55, 0, 0, 55 },
    .{ 0, 0, 64, 0, 2, 64 }, .{ 0, 0, 60, 0, 4, 60 },
    .{ 1, 0, 62, 0, 0, 63 }, .{ 0, 0, 81, 0, 0, 81 },
};
// Foot USER_CHAR, foot ON_PAGE, end noteLine NONE, end THICK_SLIM.
pub const section_note_other_enums = [_][4]usize{
    .{ 0, 0, 12, 2 }, .{ 0, 0, 14, 3 }, .{ 0, 0, 15, 2 }, .{ 0, 0, 13, 0 },
    .{ 0, 0, 12, 2 }, .{ 0, 0, 15, 3 }, .{ 1, 4, 8, 0 },  .{ 0, 0, 35, 0 },
};
// Independent tools/hwpx-section-presentation-oracle.py census.
// Each observed presentation has one direct fillBrush and one brush child.
pub const section_presentation_counts = [_]usize{ 3, 5, 2, 2, 4, 7, 0, 2 };
// Independent tools/hwpx-fill-brush-oracle.py census over selected header and
// section XML. Master-page values below are an independent part selection.
pub const fill_brush_counts = [_]usize{ 657, 351, 833, 311, 531, 1660, 648, 1537 };
pub const fill_brush_header_counts = [_]usize{ 598, 272, 778, 290, 492, 757, 631, 1346 };
// Node order: winBrush, gradation, imgBrush, color, img.
pub const fill_brush_node_counts = [_][5]usize{
    .{ 643, 6, 8, 12, 8 },  .{ 325, 25, 1, 50, 1 },     .{ 765, 13, 12, 26, 12 }, .{ 305, 6, 0, 12, 0 },
    .{ 513, 15, 3, 30, 3 }, .{ 1646, 794, 4, 1588, 4 }, .{ 640, 6, 2, 12, 2 },    .{ 1184, 28, 360, 56, 360 },
};
pub const fill_brush_direct_children = [_]usize{ 677, 402, 828, 323, 564, 4036, 662, 1988 };
pub const fill_brush_non_six_hex = [_]usize{ 266, 158, 165, 163, 329, 165, 183, 234 };
pub const fill_brush_multiple_variants = [_]usize{ 0, 0, 2, 0, 0, 784, 0, 35 };
pub const fill_brush_missing_hatch_style = [_]usize{ 643, 324, 763, 305, 512, 1645, 640, 1184 };
pub const fill_brush_missing_color_num = [_]usize{ 0, 0, 0, 0, 0, 3, 2, 3 };
// Marker order: win faceColor="none", win hatchColor 8-hex.
pub const fill_brush_color_markers = [_][2]usize{
    .{ 141, 107 }, .{ 110, 41 }, .{ 106, 50 }, .{ 108, 27 },
    .{ 102, 142 }, .{ 92, 42 },  .{ 112, 65 }, .{ 123, 103 },
};
// Signed sums: grad angle/centerX/centerY/step, unsigned colorNum, signed
// stepCenter, img bright/contrast. Missing colorNum contributes nothing.
pub const fill_brush_numeric_sums = [_][8]i64{
    .{ 90, 250, 100, 655, 12, 300, 0, 0 },
    .{ 180, 1092, 670, 2360, 50, 1250, 50, -15 },
    .{ 1040, 190, 90, 394, 26, 356, 0, 0 },
    .{ 360, 100, 0, 1220, 12, 300, 0, 0 },
    .{ 720, 351, 154, 1337, 30, 746, 70, -50 },
    .{ 28770, 29140, 28867, 41855, 1582, 39700, 0, 0 },
    .{ 450, 90, 90, 1120, 8, 300, 0, 0 },
    .{ 1310, 1004, 880, 2840, 50, 1400, 720, 0 },
};
// Gradation type LINEAR/RADIAL/CONICAL/SQUARE.
pub const fill_brush_gradation_types = [_][4]usize{
    .{ 5, 1, 0, 0 }, .{ 14, 10, 0, 1 },   .{ 13, 0, 0, 0 }, .{ 6, 0, 0, 0 },
    .{ 7, 2, 5, 1 }, .{ 29, 691, 1, 73 }, .{ 6, 0, 0, 0 },  .{ 11, 17, 0, 0 },
};
// Image brush mode TOTAL/CENTER/TILE_VERT_RIGHT/ZOOM/TILE.
pub const fill_brush_image_modes = [_][5]usize{
    .{ 5, 0, 0, 3, 0 }, .{ 0, 1, 0, 0, 0 }, .{ 11, 0, 0, 0, 1 }, .{ 0, 0, 0, 0, 0 },
    .{ 1, 1, 0, 1, 0 }, .{ 3, 0, 0, 1, 0 }, .{ 2, 0, 0, 0, 0 },  .{ 282, 70, 8, 0, 0 },
};
// Image effect REAL_PIC/GRAY_SCALE; hatch VERTICAL/BACK_SLASH/CROSS_DIAGONAL.
pub const fill_brush_image_effects = [_][2]usize{
    .{ 8, 0 }, .{ 1, 0 }, .{ 12, 0 }, .{ 0, 0 }, .{ 3, 0 }, .{ 4, 0 }, .{ 2, 0 }, .{ 348, 12 },
};
pub const fill_brush_hatch_styles = [_][3]usize{
    .{ 0, 0, 0 }, .{ 1, 0, 0 }, .{ 0, 1, 1 }, .{ 0, 0, 0 },
    .{ 0, 0, 1 }, .{ 0, 1, 0 }, .{ 0, 0, 0 }, .{ 0, 0, 0 },
};
// Independent --master census from tools/hwpx-fill-brush-oracle.py. Only
// manifest-selected canonical master pages are included; face/hatch sums use
// the numeric value of exact six-digit hex spellings.
pub const master_fill_brush_parts = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
pub const fill_brush_image_link_sites = [_]usize{ 8, 1, 12, 0, 3, 4, 2, 360 };
pub const picture_image_sites = [_]usize{ 257, 199, 261, 337, 199, 271, 200, 269 };
pub const picture_image_embedded = [_]usize{ 253, 191, 255, 328, 193, 266, 196, 263 };
pub const picture_image_external = [_]usize{ 0, 0, 0, 4, 3, 0, 0, 0 };
pub const picture_image_empty = [_]usize{ 4, 8, 6, 5, 3, 5, 4, 6 };
pub const picture_image_target_index_sums = [_]usize{ 2578, 2342, 3413, 2270, 2643, 4020, 3872, 41252 };
pub const picture_payload_targets = [_]usize{ 202, 186, 186, 111, 184, 250, 155, 239 };
pub const picture_payload_formats = [_][9]usize{ .{ 82, 42, 71, 7, 0, 0, 0, 0, 0 }, .{ 56, 30, 99, 1, 0, 0, 0, 0, 0 }, .{ 39, 55, 86, 0, 6, 0, 0, 0, 0 }, .{ 20, 69, 15, 4, 0, 3, 0, 0, 0 }, .{ 63, 42, 79, 0, 0, 0, 0, 0, 0 }, .{ 80, 25, 130, 0, 13, 0, 0, 2, 0 }, .{ 35, 25, 94, 0, 0, 1, 0, 0, 0 }, .{ 66, 56, 103, 7, 4, 2, 1, 0, 0 } };
pub const picture_payload_invalid_wmf = [_]usize{ 0, 0, 2, 0, 0, 0, 0, 1 };
pub const picture_payload_invalid_tiff = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const picture_payload_invalid_pcx = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const picture_payload_invalid_svg = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const picture_payload_media_mismatches = [_]usize{ 26, 15, 21, 8, 7, 4, 2, 23 };
pub const picture_payload_encoded_bytes = [_]usize{ 192184219, 201191216, 346637479, 42000214, 182624555, 338877771, 100332528, 109641469 };
pub const picture_payload_non_embedded = [_]usize{ 4, 8, 6, 9, 6, 5, 4, 6 };
pub const picture_payload_invalid_png_minimum = [_]usize{ 4, 3, 9, 0, 2, 2, 3, 6 };
pub const master_picture_image_sites = [_]usize{ 4, 3, 10, 0, 0, 0, 3, 15 };
pub const master_picture_image_target_index_sums = [_]usize{ 4, 3, 10, 0, 0, 0, 3, 4295 };
pub const master_picture_payload_targets = [_]usize{ 2, 1, 2, 0, 0, 0, 1, 3 };
pub const master_picture_payload_encoded_bytes = [_]usize{ 162822, 93341, 162822, 0, 0, 0, 93341, 584387 };
pub const fill_brush_image_target_index_sums = [_]usize{ 9, 0, 57, 0, 0, 1, 1, 61786 };
pub const fill_brush_image_payload_targets = [_]usize{ 8, 1, 10, 0, 3, 4, 2, 360 };
pub const fill_brush_image_payload_formats = [_][6]usize{ .{ 3, 4, 0, 1, 0, 0 }, .{ 0, 0, 1, 0, 0, 0 }, .{ 8, 2, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0, 0 }, .{ 2, 1, 0, 0, 0, 0 }, .{ 1, 3, 0, 0, 0, 0 }, .{ 0, 2, 0, 0, 0, 0 }, .{ 7, 353, 0, 0, 0, 0 } };
pub const fill_brush_image_payload_media_mismatches = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 7 };
pub const fill_brush_image_payload_inspection_failures = [_]usize{ 0, 0, 8, 0, 0, 0, 0, 0 };
pub const fill_brush_image_payload_encoded_bytes = [_]usize{ 1417279, 85078, 17062, 0, 665618, 665436, 41164, 5739372 };
pub const master_fill_brush_image_link_sites = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const master_fill_brush_counts = [_]usize{ 7, 3, 13, 0, 0, 0, 3, 14 };
pub const master_fill_brush_face_sums = [_]u64{ 46844616, 0, 46844616, 0, 0, 0, 0, 82570215 };
pub const master_fill_brush_hatch_sums = [_]u64{ 0, 0, 0, 0, 0, 0, 0, 100663290 };
// Independent tools/hwpx-section-definition-reference-oracle.py census.
pub const section_outline_zero = [_]usize{ 16, 19, 13, 13, 14, 17, 11, 39 };
pub const section_outline_resolved = [_]usize{ 55, 49, 56, 41, 47, 43, 48, 53 };
pub const section_outline_absent_table = [_]usize{ 4, 4, 3, 1, 3, 2, 4, 0 };
pub const section_memo_zero = [_]usize{ 53, 62, 57, 46, 55, 56, 52, 85 };
pub const section_memo_resolved = [_]usize{ 22, 10, 15, 9, 9, 6, 11, 7 };
pub const section_definition_missing_id = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 10 };
pub const section_definition_empty_id = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 82 };
pub const section_definition_missing_new_tabs = [_]usize{ 9, 16, 10, 8, 16, 9, 5, 18 };
pub const section_definition_unit_char = [_]usize{ 1, 0, 0, 0, 0, 0, 0, 0 };
pub const section_definition_other_children = [_]usize{ 0, 0, 0, 0, 0, 4, 0, 0 };
pub const section_definition_direct_children = [_]usize{ 759, 719, 735, 550, 638, 619, 625, 936 };
pub const section_definition_numeric_sums = [_][6]i64{
    .{ 85_051, 596_001, 262_000, 107, 29, 14 },
    .{ 81_648, 576_000, 224_000, 59, 12, 6 },
    .{ 81_636, 576_000, 248_000, 106, 23, 19 },
    .{ 62_374, 440_000, 188_000, 55, 12, 0 },
    .{ 72_576, 511_000, 191_500, 62, 9, 0 },
    .{ 70_297, 496_000, 212_000, 47, 6, 0 },
    .{ 71_442, 504_000, 232_000, 64, 12, 3 },
    .{ 92_988, 656_000, 296_000, 62, 7, 19 },
};
// Child order follows section_definition.Child; model-unregistered children
// are counted separately, never silently forced into an official category.
pub const section_definition_child_counts = [_][12]usize{
    .{ 75, 75, 75, 75, 75, 75, 75, 217, 14, 0, 3, 0 },
    .{ 72, 72, 72, 72, 72, 71, 71, 206, 6, 0, 5, 0 },
    .{ 72, 72, 72, 72, 72, 72, 72, 210, 19, 0, 2, 0 },
    .{ 55, 55, 55, 55, 55, 55, 55, 163, 0, 0, 2, 0 },
    .{ 64, 64, 64, 64, 64, 64, 64, 186, 0, 0, 4, 0 },
    .{ 62, 62, 62, 62, 62, 60, 60, 178, 0, 0, 7, 0 },
    .{ 63, 63, 63, 63, 63, 63, 63, 181, 3, 0, 0, 0 },
    .{ 92, 92, 92, 91, 92, 91, 91, 274, 19, 0, 2, 0 },
};
pub const master_page_count_declarations = [_]usize{ 75, 72, 72, 55, 64, 62, 63, 92 };
pub const master_page_type_counts = [_][5]usize{
    .{ 1, 6, 6, 1, 0 }, .{ 1, 2, 2, 1, 0 }, .{ 0, 8, 8, 2, 1 }, .{ 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0 }, .{ 0, 0, 0, 0, 0 }, .{ 0, 1, 1, 1, 0 }, .{ 1, 4, 13, 1, 0 },
};
