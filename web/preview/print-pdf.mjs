const encoder = new TextEncoder();
const MAX_BYTES = 50 * 1024 * 1024;

// Canvas JPEGs are 8-bit, three-component images. Validate the header before
// declaring the pixel geometry and color space in the PDF image dictionary.
async function validateJpeg(blob, width, height) {
  const bytes = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const fail = () => {
    throw Error('InvalidPrintPdfJpeg');
  };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail();
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at++] !== 0xff) fail();
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    const length = bytes[at] * 256 + bytes[at + 1];
    if (length < 2 || at + length > bytes.length) fail();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (
        length !== 17 ||
        bytes[at + 2] !== 8 ||
        bytes[at + 7] !== 3 ||
        bytes[at + 3] * 256 + bytes[at + 4] !== height ||
        bytes[at + 5] * 256 + bytes[at + 6] !== width
      )
        fail();
      return;
    }
    if (marker === 0xda || marker === 0xd9) fail();
    at += length;
  }
  fail();
}

const point = (css) => {
  const pt = (css * 72) / 96;
  if (typeof css !== 'number' || !Number.isFinite(pt) || pt < 0.001 || pt > 14400)
    throw Error('InvalidPrintPdfMediaBox');
  return pt.toFixed(6);
};

/** Write a raster PDF with an independent MediaBox for each physical sheet. */
export async function createPrintPdf(job, { signal } = {}) {
  if (
    job?.kind !== 'paginated-canvas-print-pages' ||
    job.encoding !== 'jpeg' ||
    !Array.isArray(job.pages) ||
    job.pages.length < 1 ||
    job.pages.length > 200
  )
    throw Error('InvalidPrintPdfJob');
  const check = () => signal?.throwIfAborted();
  let length = 0;
  const chunks = [];
  const offsets = [0];
  const append = (part) => {
    const chunk = typeof part === 'string' ? encoder.encode(part) : part;
    length += chunk.size ?? chunk.byteLength;
    if (length > MAX_BYTES) throw Error('PrintPdfByteBudgetExceeded');
    chunks.push(chunk);
  };
  const object = (number, value, stream = null) => {
    offsets[number] = length;
    append(`${number} 0 obj\n${value}\n`);
    if (stream) {
      append('stream\n');
      append(stream);
      append('\nendstream\n');
    }
    append('endobj\n');
  };

  append(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = job.pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  object(2, `<< /Type /Pages /Count ${job.pages.length} /Kids [${kids}] >>`);
  for (const [ordinal, page] of job.pages.entries()) {
    check();
    const { jpeg, pixelWidth, pixelHeight } = page;
    if (
      page.ordinal !== ordinal ||
      jpeg?.type !== 'image/jpeg' ||
      !jpeg.size ||
      ![pixelWidth, pixelHeight].every((n) => Number.isInteger(n) && n > 0 && n <= 8192)
    )
      throw Error('InvalidPrintPdfPage');
    if (jpeg.size > MAX_BYTES - length) throw Error('PrintPdfByteBudgetExceeded');
    await validateJpeg(jpeg, pixelWidth, pixelHeight);
    check();
    const width = point(page.widthCssPx);
    const height = point(page.heightCssPx);
    const pageId = 3 + ordinal * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Sheet ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    object(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>`,
      jpeg,
    );
    const content = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Sheet Do\nQ\n`);
    object(contentId, `<< /Length ${content.byteLength} >>`, content);
  }
  const xref = length;
  const table = offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${table}`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  check();
  return new Blob(chunks, { type: 'application/pdf' });
}
