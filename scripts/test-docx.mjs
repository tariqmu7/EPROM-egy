import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageBreak, BorderStyle, WidthType, ShadingType,
  AlignmentType, VerticalAlign, HeadingLevel, PageNumber } from 'docx';
import { writeFileSync } from 'fs';

const doc = new Document({
  sections: [{
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun('header')] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
    children: [
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
        new TableRow({ children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: '1B2A4A' },
            borders: { top: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL } },
            children: [new Paragraph({ children: [new TextRun({ text: 'Hello', color: 'FFFFFF', bold: true })] })],
          }),
        ]}),
      ]}),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Section 1', bold: true })] }),
    ],
  }],
});
const buf = await Packer.toBuffer(doc);
writeFileSync('test2.docx', buf);
console.log('ok', buf.length);
