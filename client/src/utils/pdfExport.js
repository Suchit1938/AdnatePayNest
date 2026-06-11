const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const LINE_HEIGHT = 16;
const TITLE_SIZE = 18;
const BODY_SIZE = 9;

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const escapePdfText = (value) =>
  normalizeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const splitCell = (value, width) => {
  const text = normalizeText(value);
  const maxChars = Math.max(8, Math.floor(width / 5));
  const words = text.split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    if (!line) {
      line = word.slice(0, maxChars);
      return;
    }

    if (`${line} ${word}`.length <= maxChars) {
      line = `${line} ${word}`;
      return;
    }

    lines.push(line);
    line = word.slice(0, maxChars);
  });

  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 3) : [""];
};

const textCommand = (text, x, y, size = BODY_SIZE, font = "F1") =>
  `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`;

const rectCommand = (x, y, width, height) =>
  `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`;

const createPdf = (pages) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index + 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
    const pageObject = 3 + index;
    const contentObject = 3 + pages.length + index;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`
    );
  });

  pages.forEach((content) => {
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(parts.join("").length);
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = parts.join("").length;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return parts.join("");
};

export const downloadPdf = (filename, title, rows, options = {}) => {
  const headers = rows.length ? Object.keys(rows[0]) : options.headers || ["Status"];
  const bodyRows = rows.length ? rows : [{ Status: "No data available" }];
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const columnWidth = usableWidth / headers.length;
  const pages = [];
  let commands = [];
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    y = PAGE_HEIGHT - MARGIN;
    commands.push(textCommand(title, MARGIN, y, TITLE_SIZE, "F2"));
    y -= 22;

    if (options.subtitle) {
      commands.push(textCommand(options.subtitle, MARGIN, y, 10));
      y -= 22;
    }

    commands.push("0.80 0.88 1.00 RG");
    headers.forEach((header, index) => {
      const x = MARGIN + index * columnWidth;
      commands.push(rectCommand(x, y - 13, columnWidth, 20));
      commands.push(textCommand(header, x + 4, y - 8, BODY_SIZE, "F2"));
    });
    commands.push("0.86 0.91 0.96 RG");
    y -= 24;
  };

  addPage();

  bodyRows.forEach((row) => {
    const cellLines = headers.map((header) => splitCell(row[header], columnWidth));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * LINE_HEIGHT + 6;

    if (y - rowHeight < MARGIN) addPage();

    headers.forEach((header, index) => {
      const x = MARGIN + index * columnWidth;
      commands.push(rectCommand(x, y - rowHeight + 5, columnWidth, rowHeight));
      cellLines[index].forEach((line, lineIndex) => {
        commands.push(textCommand(line, x + 4, y - 9 - lineIndex * LINE_HEIGHT));
      });
    });

    y -= rowHeight;
  });

  pages.push(commands.join("\n"));

  const blob = new Blob([createPdf(pages)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
