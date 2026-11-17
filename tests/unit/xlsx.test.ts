// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readXlsx, writeXlsx, serialToISO, colIndex, colName, decodeXml } from '@/data/xlsx';

describe('xlsx', () => {
  it('round-trips multiple sheets with text, numbers, booleans and unicode', () => {
    const bytes = writeXlsx([
      { name: 'Students', rows: [['GR No', 'Student Name', 'Marks', 'Pass'], ['0012', 'आशा पाटील', 87.5, true], ['13', '=HYPERLINK("x")', 91, false]] },
      { name: 'Staff/List', rows: [['Name'], ['Kadam & Sons <test>']] },
    ]);
    const sheets = readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Students', 'Staff List']);
    expect(sheets[0].rows).toEqual([['GR No', 'Student Name', 'Marks', 'Pass'], ['0012', 'आशा पाटील', '87.5', 'TRUE'], ['13', '=HYPERLINK("x")', '91', 'FALSE']]);
    expect(sheets[1].rows[1][0]).toBe('Kadam & Sons <test>');
  });
  it('reads Excel-style shared strings, rich text, sparse cells and date formats', () => {
    const files = {
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Name</t></si><si><t>DOB</t></si><si><r><t>Asha </t></r><r><rPr><b/></rPr><t>Patil</t></r></si><si><t>Joined</t></si></sst>'),
      'xl/styles.xml': strToU8('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>39696</v></c><c r="D2" s="2"><v>45474</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Ravi</t></is></c><c r="C3"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'),
    };
    const [s] = readXlsx(zipSync(files));
    expect(s.rows[0]).toEqual(['Name', 'DOB', '', 'Joined']);
    expect(s.rows[1]).toEqual(['Asha Patil', '2008-09-05', '', '2024-07-01']);
    expect(s.rows[2]).toEqual(['Ravi', '', '2', '']);
  });
  it('rejects non-xlsx input with a helpful message', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow(/xlsx/);
  });
  it('helpers', () => {
    expect(serialToISO(45474)).toBe('2024-07-01');
    expect(serialToISO(45474.5)).toBe('2024-07-01 12:00');
    expect(colIndex('AA10')).toBe(26);
    expect(colName(26)).toBe('AA');
    expect(decodeXml('&lt;a&gt; &amp; &#x41;&#66;_x000D_')).toBe('<a> & AB\r');
  });
});
