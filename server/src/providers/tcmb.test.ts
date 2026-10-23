import { describe, expect, it } from 'vitest';
import { parseCpiTable, parseHtmlTable, parsePolicyRates } from './tcmb';

describe('TCMB ayrıştırıcıları', () => {
  it('boş ve "-" hücreleri %0 saymaz', () => {
    const overnight = parseHtmlTable(
      '<tr><th>Tarih</th></tr><tr><td>11.01.05</td><td>17.00</td><td>21.00</td></tr><tr><td>01.02.05</td><td></td><td>20</td></tr>',
    );
    const repo = parseHtmlTable(
      '<tr><td>20.05.2010</td><td>-</td><td>7.00</td></tr><tr><td>17.12.2010</td><td>-</td><td>&nbsp;</td></tr>',
    );
    expect(parsePolicyRates(overnight, repo)).toEqual([
      { date: '2005-01-11', close: 17 },
      { date: '2010-05-20', close: 7 },
    ]);
  });

  it('TÜFE tablosunu aylık değişim olarak okur', () => {
    const rows = parseHtmlTable(
      '<tr><td>Ay-Yıl</td><td>Yıllık</td><td>Aylık</td></tr><tr><td>09-2026</td><td>29.73</td><td>1.84</td></tr><tr><td>01-2005</td><td>9.24</td><td>0.55</td></tr>',
    );
    expect(parseCpiTable(rows)).toEqual([
      { date: '2005-01-01', close: 0.55 },
      { date: '2026-09-01', close: 1.84 },
    ]);
  });
});
