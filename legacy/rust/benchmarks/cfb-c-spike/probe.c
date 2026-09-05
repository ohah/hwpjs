/* Integration probe for the bundled libolecf build, not a product API. */
#include <stdlib.h>
#include <string.h>
#include "libolecf_file.h"
#include "libolecf_item.h"
#include "libolecf_stream.h"

/* Returns bytes read, or -1. Caller owns input, path, and output buffers. */
int extract_stream(unsigned char *input, size_t length, const char *path,
                   unsigned char *output, size_t capacity) {
    libbfio_handle_t *io = NULL;
    libolecf_file_t *file = NULL;
    libolecf_item_t *item = NULL;
    libcerror_error_t *error = NULL;
    uint32_t size = 0;
    int result = -1;
    if (libbfio_memory_range_initialize(&io, &error) != 1 ||
        libbfio_memory_range_set(io, input, length, &error) != 1 ||
        libolecf_file_initialize(&file, &error) != 1 ||
        libolecf_file_open_file_io_handle(file, io, 1, &error) != 1 ||
        libolecf_file_get_item_by_utf8_path(file, (const uint8_t *)path,
                                          strlen(path), &item, &error) != 1 ||
        libolecf_item_get_size(item, &size, &error) != 1 || size > capacity)
        goto cleanup;
    result = (int)libolecf_stream_read_buffer(item, output, size, &error);
cleanup:
    if (item) libolecf_item_free(&item, NULL);
    if (file) { libolecf_file_close(file, NULL); libolecf_file_free(&file, NULL); }
    if (io) libbfio_handle_free(&io, NULL);
    if (error) libcerror_error_free(&error);
    return result;
}
