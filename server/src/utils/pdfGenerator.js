'use strict';

const fs = require('fs');
const path = require('path');
const { PO_DOCS_DIR } = require('../middleware/upload');

/**
 * Pure Node.js Standards-Compliant PDF 1.4 Builder.
 * Generates official Purchase Orders and Final Signed Contracts
 * with zero external dependencies, high fidelity, and instant execution.
 */

// Helper to escape PDF literal strings
function escapePdfText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

// Convert integer/float to PDF decimal
function pt(val) {
  return Number(val).toFixed(2);
}

/** Formats currency amount in Indian Rupee format */
function formatINR(val) {
  const num = Number(val || 0);
  return 'INR ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formats date */
function formatPdfDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
}

/**
 * Generates a complete Purchase Order or Final Signed Contract PDF.
 * @param {Object} po - Complete PO object with project, contractor, site, milestones, signatures
 * @param {Object} options - { isSignedContract: boolean }
 * @returns {Buffer} PDF binary buffer
 */
function generatePoPdfBuffer(po, options = {}) {
  const isSigned = Boolean(options.isSignedContract || po.status === 'contract_signed' || (po.contractor_signed_at && po.company_signed_at));
  
  // Page size: A4 (595.28 x 841.89 points)
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);

  // We can build 1 or 2 pages if milestones & T&C are long
  const pages = [];
  let stream = [];

  function drawText(text, x, y, size = 9, font = 'F1', color = '0.1 0.1 0.1') {
    const [r, g, b] = color.split(' ');
    stream.push(`${r} ${g} ${b} rg`);
    stream.push(`BT /${font} ${size} Tf ${pt(x)} ${pt(y)} Td (${escapePdfText(text)}) Tj ET`);
  }

  function drawRect(x, y, w, h, fillColor = null, strokeColor = null, lineWidth = 0.5) {
    if (strokeColor) {
      const [r, g, b] = strokeColor.split(' ');
      stream.push(`${r} ${g} ${b} RG ${lineWidth} w`);
    }
    if (fillColor) {
      const [r, g, b] = fillColor.split(' ');
      stream.push(`${r} ${g} ${b} rg`);
    }
    if (fillColor && strokeColor) {
      stream.push(`${pt(x)} ${pt(y)} ${pt(w)} ${pt(h)} re B`);
    } else if (fillColor) {
      stream.push(`${pt(x)} ${pt(y)} ${pt(w)} ${pt(h)} re f`);
    } else if (strokeColor) {
      stream.push(`${pt(x)} ${pt(y)} ${pt(w)} ${pt(h)} re s`);
    }
  }

  function drawLine(x1, y1, x2, y2, strokeColor = '0.8 0.8 0.8', lineWidth = 0.5) {
    const [r, g, b] = strokeColor.split(' ');
    stream.push(`${r} ${g} ${b} RG ${lineWidth} w`);
    stream.push(`${pt(x1)} ${pt(y1)} m ${pt(x2)} ${pt(y2)} l S`);
  }

  // ---- PAGE 1 ----
  let cursorY = pageHeight - margin;

  // Header Box
  drawRect(margin, cursorY - 60, contentWidth, 60, '0.96 0.95 0.98', '0.85 0.8 0.92', 1);
  drawText('ARCHITECTURE & CONSTRUCTION ERP', margin + 16, cursorY - 24, 14, 'F2', '0.25 0.15 0.45');
  drawText('Corporate Office: Sector 62, Noida, NCR, India · Tel: +91 120 456 7890 · Email: info@architecture-erp.local', margin + 16, cursorY - 40, 8, 'F1', '0.4 0.4 0.4');
  drawText('GSTIN: 07AAAAA0000A1Z5 · PAN: AAAAA0000A', margin + 16, cursorY - 52, 8, 'F1', '0.4 0.4 0.4');

  cursorY -= 75;

  // Document Title & Status Pill
  const title = isSigned ? 'EXECUTED CONTRACT AGREEMENT' : 'PURCHASE / WORK ORDER';
  drawText(title, margin, cursorY, 15, 'F2', '0.1 0.1 0.1');

  const statusLabel = (po.status || 'draft').toUpperCase().replace(/_/g, ' ');
  const statusColor = isSigned ? '0.1 0.55 0.3' : '0.4 0.2 0.7';
  drawRect(pageWidth - margin - 120, cursorY - 4, 120, 18, isSigned ? '0.9 0.97 0.92' : '0.94 0.92 0.98', statusColor, 1);
  drawText(statusLabel, pageWidth - margin - 110, cursorY + 2, 8.5, 'F2', statusColor);

  cursorY -= 20;

  // Info Cards Row: Left: PO Info, Right: Project & Site
  const cardWidth = (contentWidth - 10) / 2;
  const cardHeight = 78;

  // Card 1: PO & Timeline
  drawRect(margin, cursorY - cardHeight, cardWidth, cardHeight, '0.98 0.98 0.99', '0.88 0.88 0.9', 0.5);
  drawText('ORDER REFERENCE', margin + 10, cursorY - 14, 8, 'F2', '0.45 0.45 0.5');
  drawText(`PO Number: ${po.po_number || po.poNumber}`, margin + 10, cursorY - 28, 9, 'F2', '0.1 0.1 0.1');
  drawText(`PO Date: ${formatPdfDate(po.po_date || po.poDate)}`, margin + 10, cursorY - 42, 8.5, 'F1', '0.2 0.2 0.2');
  drawText(`Validity / Due Date: ${formatPdfDate(po.validity_date || po.validityDate)}`, margin + 10, cursorY - 56, 8.5, 'F1', '0.2 0.2 0.2');
  drawText(`Payment Terms: ${po.payment_terms || po.paymentTerms || 'Milestone Based'}`, margin + 10, cursorY - 70, 8, 'F1', '0.3 0.3 0.3');

  // Card 2: Project & Site
  const pX = margin + cardWidth + 10;
  drawRect(pX, cursorY - cardHeight, cardWidth, cardHeight, '0.98 0.98 0.99', '0.88 0.88 0.9', 0.5);
  drawText('PROJECT & SITE LOCATION', pX + 10, cursorY - 14, 8, 'F2', '0.45 0.45 0.5');
  drawText(`Project: ${po.project_name || po.projectName || '—'} (${po.project_code || po.projectCode || ''})`, pX + 10, cursorY - 28, 9, 'F2', '0.1 0.1 0.1');
  drawText(`Site: ${po.site_name || po.siteName || 'All Project Sites'}`, pX + 10, cursorY - 42, 8.5, 'F1', '0.2 0.2 0.2');
  drawText(`Location: ${po.site_address || po.project_location || 'Project Site Ground'}`, pX + 10, cursorY - 56, 8, 'F1', '0.3 0.3 0.3');

  cursorY -= (cardHeight + 12);

  // Contractor Card Full Width
  const cntHeight = 56;
  drawRect(margin, cursorY - cntHeight, contentWidth, cntHeight, '0.98 0.98 0.99', '0.88 0.88 0.9', 0.5);
  drawText('CONTRACTOR DETAILS', margin + 10, cursorY - 14, 8, 'F2', '0.45 0.45 0.5');
  drawText(`Name: ${po.contractor_name || po.contractorName || '—'}`, margin + 10, cursorY - 28, 9.5, 'F2', '0.1 0.1 0.1');
  drawText(`Contact: ${po.contractor_contact_person || '—'} · Phone: ${po.contractor_phone || '—'} · Email: ${po.contractor_email || '—'}`, margin + 10, cursorY - 42, 8.5, 'F1', '0.2 0.2 0.2');
  if (po.contractor_address) {
    drawText(`Address: ${po.contractor_address}`, margin + 10, cursorY - 52, 8, 'F1', '0.35 0.35 0.35');
  }

  cursorY -= (cntHeight + 14);

  // Financial Breakdown Box
  drawRect(margin, cursorY - 44, contentWidth, 44, '0.94 0.96 0.99', '0.8 0.88 0.96', 0.5);
  const colW = contentWidth / 4;
  drawText('TOTAL PO VALUE', margin + 10, cursorY - 14, 7.5, 'F2', '0.3 0.4 0.5');
  drawText(formatINR(po.total_amount || po.totalAmount), margin + 10, cursorY - 32, 11, 'F2', '0.1 0.3 0.6');

  drawText('ADVANCE AMOUNT', margin + colW + 10, cursorY - 14, 7.5, 'F2', '0.3 0.4 0.5');
  drawText(formatINR(po.advance_amount || po.advanceAmount), margin + colW + 10, cursorY - 32, 10, 'F2', '0.2 0.2 0.2');

  drawText('MATERIAL COMPONENT', margin + (colW * 2) + 10, cursorY - 14, 7.5, 'F2', '0.3 0.4 0.5');
  drawText(formatINR(po.material_amount || po.materialAmount), margin + (colW * 2) + 10, cursorY - 32, 10, 'F2', '0.2 0.2 0.2');

  drawText('LABOUR COMPONENT', margin + (colW * 3) + 10, cursorY - 14, 7.5, 'F2', '0.3 0.4 0.5');
  drawText(formatINR(po.labour_amount || po.labourAmount), margin + (colW * 3) + 10, cursorY - 32, 10, 'F2', '0.2 0.2 0.2');

  cursorY -= 56;

  // Scope of Work description
  if (po.work_description || po.workDescription) {
    drawText('SCOPE OF WORK / DESCRIPTION', margin, cursorY, 8.5, 'F2', '0.3 0.3 0.3');
    cursorY -= 12;
    drawText(po.work_description || po.workDescription, margin, cursorY, 8.5, 'F1', '0.15 0.15 0.15');
    cursorY -= 18;
  }

  // Milestones Table
  const milestones = po.milestones || [];
  drawText(`PAYMENT & WORK MILESTONES (${milestones.length})`, margin, cursorY, 8.5, 'F2', '0.3 0.3 0.3');
  cursorY -= 14;

  // Table Header
  const thHeight = 18;
  drawRect(margin, cursorY - thHeight, contentWidth, thHeight, '0.92 0.92 0.94', '0.8 0.8 0.82', 0.5);
  drawText('#', margin + 8, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  drawText('Milestone Name', margin + 30, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  drawText('Trigger / Condition', margin + 190, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  drawText('%', margin + 340, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  drawText('Amount', margin + 380, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  drawText('Status', margin + 450, cursorY - 12, 7.5, 'F2', '0.2 0.2 0.2');
  cursorY -= thHeight;

  // Table Rows (up to 6 on page 1)
  const page1Milestones = milestones.slice(0, 6);
  page1Milestones.forEach((m, idx) => {
    const rH = 17;
    const bg = idx % 2 === 0 ? '1 1 1' : '0.98 0.98 0.99';
    drawRect(margin, cursorY - rH, contentWidth, rH, bg, '0.88 0.88 0.9', 0.5);
    drawText(String(idx + 1), margin + 8, cursorY - 12, 8, 'F1', '0.3 0.3 0.3');
    drawText(m.milestone_name || m.milestoneName || `Milestone ${idx + 1}`, margin + 30, cursorY - 12, 8, 'F2', '0.1 0.1 0.1');
    drawText(m.condition_trigger || m.conditionTrigger || 'As scheduled', margin + 190, cursorY - 12, 7.5, 'F1', '0.3 0.3 0.3');
    drawText(`${Number(m.percentage || 0).toFixed(1)}%`, margin + 340, cursorY - 12, 8, 'F1', '0.2 0.2 0.2');
    drawText(formatINR(m.amount), margin + 380, cursorY - 12, 8, 'F2', '0.1 0.1 0.1');
    const isComp = (m.status === 'completed');
    drawText(isComp ? 'COMPLETED' : 'PENDING', margin + 450, cursorY - 12, 7.5, 'F2', isComp ? '0.1 0.5 0.2' : '0.5 0.4 0.1');
    cursorY -= rH;
  });

  cursorY -= 16;

  // Terms & Conditions section on Page 1 or 2
  drawText('TERMS & CONDITIONS', margin, cursorY, 8.5, 'F2', '0.3 0.3 0.3');
  cursorY -= 14;

  const rawTerms = po.terms_conditions || po.termsConditions;
  let termsList = [];
  if (Array.isArray(rawTerms)) {
    termsList = rawTerms;
  } else if (typeof rawTerms === 'string') {
    try {
      const parsed = JSON.parse(rawTerms);
      if (Array.isArray(parsed)) termsList = parsed;
      else termsList = rawTerms.split('\n').filter(Boolean);
    } catch {
      termsList = rawTerms.split('\n').filter(Boolean);
    }
  }

  if (termsList.length === 0) {
    termsList = [
      '1. All materials supplied must conform to approved project specifications and site delivery schedules.',
      '2. Workmanship must comply with approved engineering drawings, quality benchmarks, and safety standards.',
      '3. Milestone payments will be released upon verified site inspection and submission of certified bills.',
      '4. Statutory compliance (minimum wages, worker safety PPE, PF, ESIC) is the sole responsibility of the contractor.',
      '5. 12-month defect liability period applies following final handover inspection.',
    ];
  }

  // Draw up to 5 terms on page 1
  termsList.slice(0, 5).forEach((clause) => {
    const textStr = String(clause).trim();
    if (!textStr) return;
    drawText(textStr.length > 105 ? textStr.substring(0, 102) + '...' : textStr, margin + 8, cursorY, 7.5, 'F1', '0.25 0.25 0.25');
    cursorY -= 12;
  });

  cursorY -= 10;

  // Signature Blocks
  const sigBoxHeight = 65;
  const sigBoxWidth = (contentWidth - 16) / 2;

  // Contractor Signature Box
  drawRect(margin, cursorY - sigBoxHeight, sigBoxWidth, sigBoxHeight, '0.98 0.98 0.99', '0.8 0.8 0.84', 0.5);
  drawText('CONTRACTOR ACCEPTANCE & SIGNATURE', margin + 10, cursorY - 14, 7.5, 'F2', '0.3 0.3 0.35');
  if (po.contractor_signed_at || po.contractorSignedAt) {
    drawText('✓ DIGITALLY SIGNED', margin + 10, cursorY - 28, 9, 'F2', '0.1 0.55 0.25');
    drawText(`Signer: ${po.contractor_signed_name || po.contractorSignedName || po.contractor_name || 'Authorized Signatory'}`, margin + 10, cursorY - 42, 8, 'F1', '0.2 0.2 0.2');
    drawText(`Timestamp: ${formatPdfDate(po.contractor_signed_at || po.contractorSignedAt)}`, margin + 10, cursorY - 54, 7.5, 'F1', '0.4 0.4 0.4');
  } else {
    drawText('[ Pending Contractor Signature ]', margin + 10, cursorY - 36, 8.5, 'F1', '0.5 0.5 0.5');
    drawLine(margin + 10, cursorY - 48, margin + sigBoxWidth - 10, cursorY - 48, '0.7 0.7 0.7', 0.5);
    drawText('Authorized Signatory & Seal', margin + 10, cursorY - 58, 7.5, 'F1', '0.5 0.5 0.5');
  }

  // Company Signature Box
  const cX = margin + sigBoxWidth + 16;
  drawRect(cX, cursorY - sigBoxHeight, sigBoxWidth, sigBoxHeight, '0.98 0.98 0.99', '0.8 0.8 0.84', 0.5);
  drawText('FOR COMPANY / ARCHITECTURE ERP', cX + 10, cursorY - 14, 7.5, 'F2', '0.3 0.3 0.35');
  if (po.company_signed_at || po.companySignedAt) {
    drawText('✓ DIGITALLY APPROVED & SEALED', cX + 10, cursorY - 28, 9, 'F2', '0.1 0.55 0.25');
    drawText(`Representative: ${po.company_signed_name || po.companySignedName || 'Authorized Officer'}`, cX + 10, cursorY - 42, 8, 'F1', '0.2 0.2 0.2');
    drawText(`Designation: ${po.company_signed_designation || po.companySignedDesignation || 'Project Director'} · Date: ${formatPdfDate(po.company_signed_at || po.companySignedAt)}`, cX + 10, cursorY - 54, 7.5, 'F1', '0.4 0.4 0.4');
  } else {
    drawText('[ Pending Company Counter-Signature ]', cX + 10, cursorY - 36, 8.5, 'F1', '0.5 0.5 0.5');
    drawLine(cX + 10, cursorY - 48, cX + sigBoxWidth - 10, cursorY - 48, '0.7 0.7 0.7', 0.5);
    drawText('Authorized Representative & Seal', cX + 10, cursorY - 58, 7.5, 'F1', '0.5 0.5 0.5');
  }

  // Footer Note
  drawText('Generated by Architecture ERP · Secure Digital Record · Page 1 of 1', margin, 24, 7.5, 'F1', '0.5 0.5 0.5');

  // Push Page 1 commands
  pages.push(stream.join('\n'));

  // Build PDF document objects
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Font Helvetica (F1)
  // Obj 4: Font Helvetica-Bold (F2)
  // Obj 5: Page 1
  // Obj 6: Content 1
  const catalogObjNum = 1;
  const pagesObjNum = 2;
  const f1ObjNum = 3;
  const f2ObjNum = 4;
  const page1ObjNum = 5;
  const content1ObjNum = 6;

  const fontF1 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  const fontF2 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  const pageContent1 = pages[0];
  const stream1 = `<< /Length ${Buffer.byteLength(pageContent1, 'utf8')} >>\nstream\n${pageContent1}\nendstream`;

  const page1Obj = `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${content1ObjNum} 0 R /Resources << /Font << /F1 ${f1ObjNum} 0 R /F2 ${f2ObjNum} 0 R >> >> >>`;
  const pagesObj = `<< /Type /Pages /Kids [${page1ObjNum} 0 R] /Count 1 >>`;
  const catalogObj = `<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`;

  const allObjs = [catalogObj, pagesObj, fontF1, fontF2, page1Obj, stream1];

  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];

  allObjs.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${allObjs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    output += `${String(off).padStart(10, '0')} 00000 n \n`;
  });

  output += `trailer\n<< /Size ${allObjs.length + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, 'binary');
}

/**
 * Generates and saves digital PO or signed contract PDF to uploads/po_documents/
 * @param {Object} po - Complete PO object
 * @param {Object} options - { isSignedContract: boolean }
 * @returns {string} Absolute file path to the saved PDF
 */
function savePoPdfFile(po, options = {}) {
  const isSigned = Boolean(options.isSignedContract || po.status === 'contract_signed');
  const buffer = generatePoPdfBuffer(po, options);
  const prefix = isSigned ? 'signed-contract' : 'po';
  const filename = `${prefix}-${po.po_number || po.poNumber || po.id}-${Date.now()}.pdf`;
  const filePath = path.join(PO_DOCS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = {
  generatePoPdfBuffer,
  savePoPdfFile,
  formatINR,
  formatPdfDate,
};
