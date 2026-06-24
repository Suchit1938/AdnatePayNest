const PDFDocument = require('pdfkit');
const { drawLogo } = require('../utils/branding');

const normalizeText = (value) =>
  String(value ?? '')
    .replace(/₹|â‚¹/g, 'INR ')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatHeader = (value) =>
  normalizeText(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const pickRows = (rows) =>
  Array.isArray(rows) && rows.length ? rows.slice(0, 500) : [{ Status: 'No data available' }];

const pickHeaders = (headers, rows) => {
  if (Array.isArray(headers) && headers.length) return headers.map(formatHeader);
  return Object.keys(rows[0] || { Status: '' }).map(formatHeader);
};

const sanitizeFilename = (value) =>
  `${normalizeText(value || 'report').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report'}.pdf`;

const renderHeader = (doc, { title, subtitle }) => {
  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;
  const contentWidth = pageWidth - margin * 2;
  const top = doc.y;

  doc
    .roundedRect(margin, top, contentWidth, 76, 10)
    .fillAndStroke('#0f172a', '#0f172a');

  if (!drawLogo(doc, margin + contentWidth - 62, top + 14, { width: 38, height: 38 })) {
    doc
      .circle(margin + contentWidth - 43, top + 33, 19)
      .fill('#ffffff')
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('APN', margin + contentWidth - 56, top + 29, {
        width: 26,
        align: 'center',
      });
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor('#ffffff')
    .text(normalizeText(title || 'Report'), margin + 16, top + 16, {
      width: contentWidth - 220,
      height: 24,
    });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#cbd5e1')
    .text(normalizeText(subtitle || `Generated on ${new Date().toLocaleDateString('en-IN')}`), margin + 16, top + 43, {
      width: contentWidth - 32,
      height: 18,
    });
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#bfdbfe')
    .text('AdnatePayNest', margin + contentWidth - 176, top + 18, {
      width: 104,
      align: 'right',
    });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#cbd5e1')
    .text('System generated report', margin + contentWidth - 176, top + 35, {
      width: 104,
      align: 'right',
    });

  doc.y = top + 96;
};

const renderFooter = (doc, pageNumber, pageCount) => {
  const margin = doc.page.margins.left;
  const y = doc.page.height - doc.page.margins.bottom - 14;

  doc
    .moveTo(margin, y - 10)
    .lineTo(doc.page.width - margin, y - 10)
    .lineWidth(0.5)
    .strokeColor('#cbd5e1')
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#64748b')
    .text('Confidential banking report. Verify against source ledger before operational action.', margin, y, {
      width: 360,
    })
    .text(`Page ${pageNumber} of ${pageCount}`, doc.page.width - margin - 90, y, {
      width: 90,
      align: 'right',
    });
};

const valueForHeader = (row, header) => {
  const exact = row[header];

  if (exact !== undefined) return normalizeText(exact) || '-';

  const key = Object.keys(row).find((candidate) => formatHeader(candidate) === header);
  return normalizeText(row[key]) || '-';
};

const renderSummaryCards = (doc, rows, headers) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const cards = headers
    .filter((header) => /amount|value|interest|balance|total|count|status|rate/i.test(header))
    .slice(0, 4)
    .map((header) => ({ label: header, value: valueForHeader(rows[0], header) }));

  if (!cards.length || rows.length !== 1) return;

  const gap = 8;
  const cardWidth = (contentWidth - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;

  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + gap);
    doc
      .roundedRect(x, y, cardWidth, 54, 8)
      .fillAndStroke(index === 0 ? '#eff6ff' : '#f8fafc', index === 0 ? '#bfdbfe' : '#e2e8f0');
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#64748b')
      .text(card.label, x + 10, y + 10, { width: cardWidth - 20, height: 12 });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#0f172a')
      .text(card.value, x + 10, y + 27, { width: cardWidth - 20, height: 18 });
  });

  doc.y = y + 72;
};

const renderDetailLayout = (doc, rows, headers, titleOptions) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const bottom = doc.page.height - doc.page.margins.bottom - 24;
  const pairGap = 12;
  const pairWidth = (contentWidth - pairGap) / 2;

  rows.forEach((row, rowIndex) => {
    const estimatedHeight = 30 + Math.ceil(headers.length / 2) * 34;

    if (doc.y + estimatedHeight > bottom) {
      doc.addPage();
      renderHeader(doc, titleOptions);
    }

    const blockTop = doc.y;
    doc
      .roundedRect(margin, blockTop, contentWidth, estimatedHeight, 8)
      .fillAndStroke(rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc', '#e2e8f0');
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(`Record ${rowIndex + 1}`, margin + 10, blockTop + 10);

    let y = blockTop + 30;
    for (let index = 0; index < headers.length; index += 2) {
      [0, 1].forEach((offset) => {
        const header = headers[index + offset];
        if (!header) return;

        const x = margin + 10 + offset * (pairWidth + pairGap);
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#64748b')
          .text(header, x, y, { width: pairWidth - 10, height: 10 });
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#0f172a')
          .text(valueForHeader(row, header), x, y + 12, {
            width: pairWidth - 10,
            height: 20,
            ellipsis: true,
          });
      });
      y += 34;
    }

    doc.y = blockTop + estimatedHeight + 10;
  });
};

const renderTableLayout = (doc, rows, headers, titleOptions) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const bottom = doc.page.height - doc.page.margins.bottom - 24;
  const usableHeaders = headers.slice(0, 6);
  const weight = 1 / usableHeaders.length;
  const widths = usableHeaders.map(() => contentWidth * weight);

  const drawTableHeader = () => {
    let x = margin;
    const y = doc.y;
    doc.rect(margin, y, contentWidth, 24).fill('#1e3a8a');
    usableHeaders.forEach((header, index) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#ffffff')
        .text(header, x + 5, y + 8, { width: widths[index] - 10, height: 10 });
      x += widths[index];
    });
    doc.y = y + 24;
  };

  drawTableHeader();

  rows.forEach((row, rowIndex) => {
    const rowTop = doc.y;
    const rowHeight = 34;

    if (rowTop + rowHeight > bottom) {
      doc.addPage();
      renderHeader(doc, titleOptions);
      drawTableHeader();
    }

    let x = margin;
    const y = doc.y;
    doc.rect(margin, y, contentWidth, rowHeight).fill(rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc');
    usableHeaders.forEach((header, index) => {
      doc
        .rect(x, y, widths[index], rowHeight)
        .lineWidth(0.4)
        .strokeColor('#e2e8f0')
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(7.8)
        .fillColor('#0f172a')
        .text(valueForHeader(row, header), x + 5, y + 7, {
          width: widths[index] - 10,
          height: rowHeight - 12,
          ellipsis: true,
        });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  });
};

const renderTransferRegisterLayout = (doc, rows, titleOptions) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const bottom = doc.page.height - doc.page.margins.bottom - 30;
  const rowHeight = 64;
  const columns = [
    { key: 'Date', label: 'Date', width: 86 },
    { key: 'From', label: 'From', width: 156 },
    { key: 'To', label: 'To', width: 156 },
    { key: 'Amount', label: 'Amount', width: contentWidth - 86 - 156 - 156 },
  ];

  const drawHeader = () => {
    let x = margin;
    const y = doc.y;

    doc.rect(margin, y, contentWidth, 26).fill('#1e3a8a');
    columns.forEach((column) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#ffffff')
        .text(column.label, x + 8, y + 8, {
          width: column.width - 16,
          height: 12,
        });
      x += column.width;
    });
    doc.y = y + 26;
  };

  const drawCell = ({ x, y, width, height, fill, stroke = '#dbe4ef' }) => {
    doc
      .rect(x, y, width, height)
      .fillAndStroke(fill, stroke);
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    if (doc.y + rowHeight > bottom) {
      doc.addPage();
      renderHeader(doc, titleOptions);
      drawHeader();
    }

    const y = doc.y;
    const fill = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
    let x = margin;

    columns.forEach((column) => {
      drawCell({ x, y, width: column.width, height: rowHeight, fill });
      x += column.width;
    });

    x = margin;
    const date = valueForHeader(row, 'Date');
    const from = valueForHeader(row, 'From');
    const to = valueForHeader(row, 'To');
    const amount = valueForHeader(row, 'Amount');
    const fromAccount = valueForHeader(row, 'From Account');
    const toAccount = valueForHeader(row, 'To Account');
    const transferId = valueForHeader(row, 'Transfer ID');
    const transferType = valueForHeader(row, 'Type');
    const transferLabel = /transfer/i.test(transferType) ? 'Transfer' : transferType;
    const status = valueForHeader(row, 'Status');
    const statusTone = /success|approved|completed/i.test(status)
      ? '#047857'
      : /pending|review/i.test(status)
        ? '#b45309'
        : /fail|reject/i.test(status)
          ? '#b91c1c'
          : '#475569';

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#0f172a')
      .text(date, x + 8, y + 12, {
        width: columns[0].width - 16,
        height: 14,
        ellipsis: true,
      });

    x += columns[0].width;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#0f172a')
      .text(from, x + 8, y + 10, {
        width: columns[1].width - 16,
        height: 13,
        ellipsis: true,
      })
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#334155')
      .text(fromAccount, x + 8, y + 27, {
        width: columns[1].width - 16,
        height: 12,
        ellipsis: true,
      })
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#64748b')
      .text(transferId, x + 8, y + 44, {
        width: columns[1].width - 16,
        height: 11,
        ellipsis: true,
      });

    x += columns[1].width;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#0f172a')
      .text(to, x + 8, y + 10, {
        width: columns[2].width - 16,
        height: 13,
        ellipsis: true,
      })
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#334155')
      .text(toAccount, x + 8, y + 27, {
        width: columns[2].width - 16,
        height: 12,
        ellipsis: true,
      })
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#64748b')
      .text(`${transferLabel} | `, x + 8, y + 44, {
        width: columns[2].width - 16,
        height: 11,
        continued: true,
      })
      .fillColor(statusTone)
      .text(status, {
        width: columns[2].width - 16,
        height: 11,
        ellipsis: true,
      });

    x += columns[2].width;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.8)
      .fillColor('#0f172a')
      .text(amount, x + 8, y + 12, {
        width: columns[3].width - 16,
        height: 14,
        ellipsis: true,
      });

    doc.y = y + rowHeight;
  });
};

const parseLeadingNumber = (value) => {
  const match = normalizeText(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const renderSectionTitle = (doc, title, subtitle) => {
  const margin = doc.page.margins.left;
  const y = doc.y;

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#0f172a')
    .text(title, margin, y, { width: 260, height: 14 });
  if (subtitle) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(subtitle, margin, y + 16, { width: 420, height: 12 });
    doc.y = y + 36;
  } else {
    doc.y = y + 24;
  }
};

const renderClassificationPolicyLayout = (doc, rows, titleOptions) => {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const bottom = doc.page.height - doc.page.margins.bottom - 30;
  const policyRows = rows.filter((row) => valueForHeader(row, 'Classification') !== 'No data available');

  if (!policyRows.length) {
    renderDetailLayout(doc, rows, ['Status'], titleOptions);
    return;
  }

  const totalCustomers = policyRows.reduce((sum, row) => sum + parseLeadingNumber(valueForHeader(row, 'Customers')), 0);
  const highestOd = policyRows.reduce(
    (highest, row) => Math.max(highest, parseLeadingNumber(valueForHeader(row, 'Maximum OD Limit'))),
    0
  );
  const blockedOd = policyRows.reduce(
    (sum, row) => sum + parseLeadingNumber(valueForHeader(row, 'Blocked OD Accounts')),
    0
  );
  const overviewCards = [
    { label: 'Active Classifications', value: String(policyRows.length), tone: '#eff6ff', border: '#bfdbfe' },
    { label: 'Assigned Customers', value: String(totalCustomers), tone: '#f0fdf4', border: '#bbf7d0' },
    { label: 'Highest OD Limit', value: `INR ${Math.round(highestOd).toLocaleString('en-IN')}`, tone: '#fff7ed', border: '#fed7aa' },
    { label: 'Blocked OD Accounts', value: String(blockedOd), tone: '#fef2f2', border: '#fecaca' },
  ];

  renderSectionTitle(
    doc,
    'Policy Overview',
    'Customer tier controls for transfer limits, overdraft eligibility, charges, and monthly operating rules.'
  );

  const cardGap = 8;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const overviewTop = doc.y;
  overviewCards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardGap);
    doc.roundedRect(x, overviewTop, cardWidth, 56, 8).fillAndStroke(card.tone, card.border);
    doc
      .font('Helvetica')
      .fontSize(7.2)
      .fillColor('#64748b')
      .text(card.label, x + 9, overviewTop + 10, { width: cardWidth - 18, height: 12 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f172a')
      .text(card.value, x + 9, overviewTop + 29, { width: cardWidth - 18, height: 16, ellipsis: true });
  });
  doc.y = overviewTop + 78;

  renderSectionTitle(
    doc,
    'Classification Rules',
    'Each card groups the policy controls an operator needs to verify before approving limits or overdraft access.'
  );

  const drawMetric = ({ x, y, width, label, value, fill = '#f8fafc', border = '#e2e8f0', height = 42, valueHeight = 12 }) => {
    doc.roundedRect(x, y, width, height, 7).fillAndStroke(fill, border);
    doc
      .font('Helvetica')
      .fontSize(6.9)
      .fillColor('#64748b')
      .text(label, x + 8, y + 8, { width: width - 16, height: 10 });
    doc
      .font('Helvetica-Bold')
      .fontSize(8.3)
      .fillColor('#0f172a')
      .text(value, x + 8, y + 23, { width: width - 16, height: valueHeight, ellipsis: true });
  };

  const drawOdRule = ({ label, value, x, y, width }) => {
    doc.rect(x, y, width, 22).fillAndStroke('#ffffff', '#e2e8f0');
    doc
      .font('Helvetica-Bold')
      .fontSize(7.2)
      .fillColor('#334155')
      .text(label, x + 7, y + 7, { width: 62, height: 10 });
    doc
      .font('Helvetica')
      .fontSize(7.1)
      .fillColor('#0f172a')
      .text(value, x + 72, y + 7, { width: width - 80, height: 10, ellipsis: true });
  };

  policyRows.forEach((row, index) => {
    const cardHeight = 218;

    if (doc.y + cardHeight > bottom) {
      doc.addPage();
      renderHeader(doc, titleOptions);
      renderSectionTitle(doc, 'Classification Rules', 'Continued policy controls by tier.');
    }

    const y = doc.y;
    const fill = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const classification = valueForHeader(row, 'Classification');
    const customers = valueForHeader(row, 'Customers');
    const blocked = valueForHeader(row, 'Blocked OD Accounts');
    const blockedTone = parseLeadingNumber(blocked) > 0 ? '#b91c1c' : '#047857';

    doc.roundedRect(margin, y, contentWidth, cardHeight, 9).fillAndStroke(fill, '#dbe4ef');
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0f172a')
      .text(classification, margin + 14, y + 13, { width: 200, height: 16, ellipsis: true });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(`${customers} assigned customers`, margin + 14, y + 32, { width: 180, height: 11 });
    doc
      .roundedRect(margin + contentWidth - 112, y + 13, 96, 22, 11)
      .fillAndStroke(parseLeadingNumber(blocked) > 0 ? '#fef2f2' : '#f0fdf4', parseLeadingNumber(blocked) > 0 ? '#fecaca' : '#bbf7d0');
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(blockedTone)
      .text(`${blocked} blocked OD`, margin + contentWidth - 104, y + 20, { width: 80, height: 9, align: 'center' });

    const metricTop = y + 52;
    const metricWidth = (contentWidth - 28 - 18) / 3;
    drawMetric({
      x: margin + 14,
      y: metricTop,
      width: metricWidth,
      label: 'Per Transfer',
      value: valueForHeader(row, 'Per Transfer Limit'),
      fill: '#eff6ff',
      border: '#bfdbfe',
    });
    drawMetric({
      x: margin + 14 + metricWidth + 9,
      y: metricTop,
      width: metricWidth,
      label: 'Daily Transfer',
      value: valueForHeader(row, 'Daily Limit'),
      fill: '#f0fdfa',
      border: '#99f6e4',
    });
    drawMetric({
      x: margin + 14 + (metricWidth + 9) * 2,
      y: metricTop,
      width: metricWidth,
      label: 'Monthly Transfer',
      value: valueForHeader(row, 'Monthly Limit'),
      fill: '#f8fafc',
      border: '#e2e8f0',
    });

    const leftX = margin + 14;
    const leftWidth = Math.round(contentWidth * 0.58);
    const rightX = leftX + leftWidth + 12;
    const rightWidth = contentWidth - 28 - leftWidth - 12;
    const detailTop = y + 118;

    doc
      .font('Helvetica-Bold')
      .fontSize(7.6)
      .fillColor('#334155')
      .text('Account-wise OD Rules', leftX, detailTop - 12, { width: leftWidth, height: 10 });
    drawOdRule({ label: 'Savings', value: valueForHeader(row, 'Savings OD Rule'), x: leftX, y: detailTop, width: leftWidth });
    drawOdRule({ label: 'Current', value: valueForHeader(row, 'Current OD Rule'), x: leftX, y: detailTop + 22, width: leftWidth });
    drawOdRule({ label: 'Salary', value: valueForHeader(row, 'Salary OD Rule'), x: leftX, y: detailTop + 44, width: leftWidth });

    drawMetric({
      x: rightX,
      y: detailTop,
      width: rightWidth,
      label: 'Charges',
      value: `${valueForHeader(row, 'Interest Rate')} | ${valueForHeader(row, 'Penalty Amount')}`,
      fill: '#fff7ed',
      border: '#fed7aa',
    });
    drawMetric({
      x: rightX,
      y: detailTop + 50,
      width: rightWidth,
      label: 'Operating Rule',
      value: `${valueForHeader(row, 'Monthly OD Uses')}; ${valueForHeader(row, 'Settlement Rule')}`,
      fill: '#f8fafc',
      border: '#e2e8f0',
      height: 50,
      valueHeight: 20,
    });

    doc.y = y + cardHeight + 12;
  });
};

const downloadReportPdf = async (req, res) => {
  const rows = pickRows(req.body.rows);
  const headers = pickHeaders(req.body.headers, rows);
  const title = normalizeText(req.body.title || 'Report');
  const subtitle = normalizeText(req.body.subtitle || `Generated by ${req.user.name || 'Admin'} on ${new Date().toLocaleString('en-IN')}`);
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: {
      Title: title,
      Subject: subtitle,
      Author: 'AdnatePayNest',
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(req.body.filename || title)}"`);
  doc.pipe(res);

  renderHeader(doc, { title, subtitle });
  renderSummaryCards(doc, rows, headers);

  if (req.body.layout === 'transfer-register') {
    renderTransferRegisterLayout(doc, rows, { title, subtitle });
  } else if (req.body.layout === 'classification-policy') {
    renderClassificationPolicyLayout(doc, rows, { title, subtitle });
  } else if (headers.length > 6 || req.body.layout === 'details') {
    renderDetailLayout(doc, rows, headers, { title, subtitle });
  } else {
    renderTableLayout(doc, rows, headers, { title, subtitle });
  }

  const pageRange = doc.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    doc.switchToPage(index);
    renderFooter(doc, index + 1, pageRange.count);
  }

  doc.end();
};

module.exports = {
  downloadReportPdf,
};
