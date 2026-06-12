const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const LINE_HEIGHT = 16;
const TITLE_SIZE = 18;
const BODY_SIZE = 9;
const LABEL_SIZE = 8;

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

const formatHeader = (value) =>
  normalizeText(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const createPdf = (pages) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index + 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
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
  const headers = options.headers || (rows.length ? Object.keys(rows[0]) : ["Status"]);
  const bodyRows = rows.length ? rows : [{ Status: "No data available" }];
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const useDetailLayout = options.layout === "details" || headers.length > 6;
  const pages = [];
  let commands = [];
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = ({ includeTableHeader = !useDetailLayout } = {}) => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    y = PAGE_HEIGHT - MARGIN;
    commands.push(textCommand(title, MARGIN, y, TITLE_SIZE, "F2"));
    y -= 22;

    if (options.subtitle) {
      commands.push(textCommand(options.subtitle, MARGIN, y, 10));
      y -= 22;
    }

    if (includeTableHeader) {
      const columnWidths = getColumnWidths(headers, bodyRows, usableWidth);

      commands.push("0.80 0.88 1.00 RG");
      headers.forEach((header, index) => {
        const x = MARGIN + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
        commands.push(rectCommand(x, y - 13, columnWidths[index], 20));
        commands.push(textCommand(formatHeader(header), x + 4, y - 8, BODY_SIZE, "F2"));
      });
      commands.push("0.86 0.91 0.96 RG");
      y -= 24;
    }
  };

  const getColumnWidths = (tableHeaders, tableRows, width) => {
    const weights = tableHeaders.map((header) => {
      const maxLength = Math.max(
        normalizeText(formatHeader(header)).length,
        ...tableRows.slice(0, 25).map((row) => normalizeText(row[header]).length)
      );

      return Math.min(Math.max(maxLength, 8), 24);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

    return weights.map((weight) => Math.max(54, (weight / totalWeight) * width));
  };

  const addDetailRows = () => {
    const pairWidth = (usableWidth - 14) / 2;

    bodyRows.forEach((row, rowIndex) => {
      const valueLines = headers.map((header) => splitCell(row[header], pairWidth - 74));
      const pairHeights = [];

      for (let index = 0; index < headers.length; index += 2) {
        pairHeights.push(
          Math.max(valueLines[index]?.length || 1, valueLines[index + 1]?.length || 1) *
            LINE_HEIGHT +
            18
        );
      }

      const blockHeight = pairHeights.reduce((sum, height) => sum + height, 0) + 18;

      if (y - blockHeight < MARGIN) addPage({ includeTableHeader: false });

      commands.push("0.86 0.91 0.96 RG");
      commands.push(rectCommand(MARGIN, y - blockHeight + 8, usableWidth, blockHeight));
      commands.push(textCommand(`Record ${rowIndex + 1}`, MARGIN + 8, y - 8, BODY_SIZE, "F2"));
      y -= 26;

      for (let index = 0; index < headers.length; index += 2) {
        const pairY = y;

        [0, 1].forEach((offset) => {
          const header = headers[index + offset];
          if (!header) return;

          const x = MARGIN + 8 + offset * (pairWidth + 14);
          commands.push(textCommand(formatHeader(header), x, pairY, LABEL_SIZE, "F2"));
          valueLines[index + offset].forEach((line, lineIndex) => {
            commands.push(textCommand(line || "-", x + 72, pairY - lineIndex * LINE_HEIGHT, BODY_SIZE));
          });
        });

        y -= pairHeights[Math.floor(index / 2)];
      }

      y -= 8;
    });
  };

  const addTableRows = () => {
    const columnWidths = getColumnWidths(headers, bodyRows, usableWidth);

    bodyRows.forEach((row) => {
      const cellLines = headers.map((header, index) => splitCell(row[header], columnWidths[index]));
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * LINE_HEIGHT + 6;

      if (y - rowHeight < MARGIN) addPage();

      headers.forEach((header, index) => {
        const x = MARGIN + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
        commands.push(rectCommand(x, y - rowHeight + 5, columnWidths[index], rowHeight));
        cellLines[index].forEach((line, lineIndex) => {
          commands.push(textCommand(line, x + 4, y - 9 - lineIndex * LINE_HEIGHT));
        });
      });

      y -= rowHeight;
    });
  };

  addPage();

  if (useDetailLayout) {
    addDetailRows();
  } else {
    addTableRows();
  }

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
