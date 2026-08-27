// COPIED from rotech-semiannual/src/utils/submissionPdf.js.
// Renders a submission (via buildSubmissionView's block outline) to a PDF and
// triggers a download named "Location_Form Name_Date Submitted.pdf".
// Colors mirror the app's Tailwind palette, same as the Excel export.
import { buildSubmissionView, submissionFileName } from './submissionView';

const BLUE_900 = [30, 58, 138];
const GRAY_900 = [17, 24, 39];
const GRAY_600 = [75, 85, 99];
const GRAY_100 = [243, 244, 246];

const TONE_STYLES = {
  positive: { fill: [187, 247, 208], text: [22, 101, 52] },   // green-200 / green-800
  negative: { fill: [254, 202, 202], text: [153, 27, 27] },   // red-200 / red-800
  warning: { fill: [254, 240, 138], text: [133, 77, 14] },    // yellow-200 / yellow-800
  neutral: { fill: null, text: [55, 65, 81] },                // gray-700
};

export async function downloadSubmissionPdf(assessment, locationName) {
  // Loaded on demand so jsPDF isn't shipped to users who never download a PDF.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const view = buildSubmissionView(assessment, locationName);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  const ensureRoom = (needed) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title band
  doc.setFillColor(...BLUE_900);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${view.formName} — ${view.formTitle}`, margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(String(view.locationName), margin, 52);
  y = 90;

  // Meta rows
  doc.setFontSize(10);
  view.meta.forEach(({ label, value }) => {
    ensureRoom(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRAY_600);
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_900);
    const wrapped = doc.splitTextToSize(String(value), pageWidth - margin * 2 - 120);
    doc.text(wrapped, margin + 120, y);
    y += 14 * wrapped.length + 2;
  });
  y += 8;

  view.blocks.forEach((block) => {
    if (block.type === 'heading') {
      ensureRoom(40);
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...BLUE_900);
      doc.text(block.text, margin, y);
      y += 8;
      doc.setDrawColor(...BLUE_900);
      doc.setLineWidth(1);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;
    } else if (block.type === 'subheading') {
      ensureRoom(30);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_900);
      doc.text(block.text, margin, y);
      y += 10;
    } else if (block.type === 'fields') {
      block.rows.forEach(({ label, value }) => {
        ensureRoom(16);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GRAY_600);
        doc.text(`${label}:`, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY_900);
        doc.text(String(value), margin + 120, y);
        y += 14;
      });
      y += 4;
    } else if (block.type === 'note') {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...GRAY_600);
      const wrapped = doc.splitTextToSize(block.text, pageWidth - margin * 2);
      ensureRoom(12 * wrapped.length + 8);
      doc.text(wrapped, margin, y);
      y += 12 * wrapped.length + 8;
    } else if (block.type === 'table') {
      const tones = block.rows.map(row => row.tone);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [block.columns],
        body: block.rows.map(row => row.cells),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, textColor: GRAY_900, lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: BLUE_900, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GRAY_100 },
        // Shade the response/status column (the last one) by tone.
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== block.columns.length - 1) return;
          const tone = TONE_STYLES[tones[data.row.index]] || TONE_STYLES.neutral;
          if (tone.fill) data.cell.styles.fillColor = tone.fill;
          data.cell.styles.textColor = tone.text;
          data.cell.styles.fontStyle = 'bold';
        },
      });
      y = doc.lastAutoTable.finalY + 12;
    }
  });

  // Footer: page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_600);
    doc.text(
      `${view.formName} — ${view.locationName} — Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 16,
      { align: 'center' }
    );
  }

  doc.save(submissionFileName(assessment, locationName));
}
