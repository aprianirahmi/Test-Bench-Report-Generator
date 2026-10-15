// Identify a file by its first bytes, the same way the backend does
// (Go's http.DetectContentType). A file renamed to .png that is really a GIF,
// AVIF or HEIC is rejected there, so we tell the operator before anything is saved.

const ascii = (buf, from, to) => String.fromCharCode(...buf.slice(from, to));

export async function sniffFileType(file) {
  const buf = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (buf.length >= 8 && buf[0] === 0x89 && ascii(buf, 1, 4) === "PNG") return { mime: "image/png", label: "PNG" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", label: "JPEG" };
  if (buf.length >= 14 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 14) === "WEBPVP") return { mime: "image/webp", label: "WEBP" };
  if (ascii(buf, 0, 5) === "%PDF-") return { mime: "application/pdf", label: "PDF" };
  if (ascii(buf, 0, 4) === "GIF8") return { mime: "image/gif", label: "GIF" };
  if (ascii(buf, 0, 2) === "BM") return { mime: "image/bmp", label: "BMP" };
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return { mime: "image/x-icon", label: "ICO" };
  if (ascii(buf, 0, 2) === "II" || ascii(buf, 0, 2) === "MM") return { mime: "image/tiff", label: "TIFF" };
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", label: "AVIF" };
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return { mime: "image/heic", label: "HEIC" };
    return { mime: "video/mp4", label: "video (MP4/MOV)" };
  }
  const head = ascii(buf, 0, 64).toLowerCase();
  if (head.includes("<svg") || head.startsWith("<?xml")) return { mime: "image/svg+xml", label: "SVG" };
  return { mime: "", label: "" };
}

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];

// Returns "" when the file is fine, otherwise a message for the operator.
export async function checkImageFile(file) {
  const t = await sniffFileType(file);
  if (IMAGE_MIMES.includes(t.mime)) return "";
  if (t.label) {
    return `The file "${file.name}" is actually in ${t.label} format, not PNG, JPG or WEBP. Re-save it as PNG or JPG and select it again.`;
  }
  return `The file "${file.name}" is not a valid PNG, JPG or WEBP image. Re-save it as PNG or JPG and select it again.`;
}

export async function checkPdfFile(file) {
  const t = await sniffFileType(file);
  if (t.mime === "application/pdf") return "";
  if (t.label) {
    return `The file "${file.name}" is actually in ${t.label} format, not PDF. Export it as PDF and select it again.`;
  }
  return `The file "${file.name}" is not a valid PDF. Export it as PDF and select it again.`;
}
