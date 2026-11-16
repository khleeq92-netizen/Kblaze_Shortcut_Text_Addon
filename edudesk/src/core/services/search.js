'use strict';

class Search {
  constructor(app) { this.app = app; this.db = app.db; }

  /**
   * Search outward letters (incl. drafts) and inward entries.
   * filters: { q, type: all|outward|inward|drafts|deleted, from, to, dateField: letter|dispatch, academicYear, categoryId, status }
   */
  run(filters = {}) {
    this.app.require('registers.view');
    const q = String(filters.q || '').trim();
    const like = `%${q}%`;
    const type = filters.type || 'all';
    const out = [];
    if (type !== 'inward') {
      const where = [];
      const p = [];
      if (type === 'deleted') where.push('l.deleted_at IS NOT NULL'); else where.push('l.deleted_at IS NULL');
      if (type === 'drafts') where.push('l.outward_no IS NULL');
      if (q) {
        where.push(`(l.outward_no LIKE ? OR l.subject LIKE ? OR l.summary LIKE ? OR l.recipient_office LIKE ? OR l.recipient_name LIKE ? OR l.recipient_designation LIKE ?
          OR l.reference_no LIKE ? OR l.category_name LIKE ? OR l.subcategory_name LIKE ? OR l.academic_year LIKE ? OR l.letter_date LIKE ? OR l.dispatch_date LIKE ? OR l.body LIKE ? OR l.tracking_no LIKE ?)`);
        for (let i = 0; i < 14; i++) p.push(like);
      }
      const dcol = filters.dateField === 'dispatch' ? 'l.dispatch_date' : 'l.letter_date';
      if (filters.from) { where.push(`${dcol} >= ?`); p.push(filters.from); }
      if (filters.to) { where.push(`${dcol} <= ?`); p.push(filters.to); }
      if (filters.academicYear) { where.push('l.academic_year = ?'); p.push(filters.academicYear); }
      if (filters.categoryId) { where.push('l.category_id = ?'); p.push(filters.categoryId); }
      if (filters.status) { where.push('(l.status = ? OR l.dispatch_status = ?)'); p.push(filters.status, filters.status); }
      for (const r of this.db.all(`SELECT l.* FROM letters l WHERE ${where.join(' AND ')} ORDER BY COALESCE(l.letter_date, l.created_at) DESC, l.id DESC LIMIT 300`, p)) {
        out.push({
          type: r.outward_no ? 'outward' : 'draft', id: r.id, number: r.outward_no, date: r.letter_date, subject: r.subject,
          party: [r.recipient_designation, r.recipient_office].filter(Boolean).join(', '), category: r.category_name, status: r.status,
          archive_status: r.archive_status, dispatch_status: r.dispatch_status, summary: r.summary, reference: r.reference_no, academic_year: r.academic_year,
          docx: this.app.resolve(r.docx_path), pdf: this.app.resolve(r.pdf_path), folder: this.app.resolve(r.archive_dir), deleted: !!r.deleted_at,
        });
      }
    }
    if (type === 'all' || type === 'inward' || type === 'deleted') {
      const where = [type === 'deleted' ? 'i.deleted_at IS NOT NULL' : 'i.deleted_at IS NULL'];
      const p = [];
      if (q) {
        where.push('(i.inward_no LIKE ? OR i.subject LIKE ? OR i.summary LIKE ? OR i.sender_office LIKE ? OR i.sender_name LIKE ? OR i.reference_no LIKE ? OR i.category_name LIKE ? OR i.academic_year LIKE ? OR i.date_received LIKE ?)');
        for (let i = 0; i < 9; i++) p.push(like);
      }
      if (filters.from) { where.push('i.date_received >= ?'); p.push(filters.from); }
      if (filters.to) { where.push('i.date_received <= ?'); p.push(filters.to); }
      if (filters.academicYear) { where.push('i.academic_year = ?'); p.push(filters.academicYear); }
      if (filters.categoryId) { where.push('i.category_id = ?'); p.push(filters.categoryId); }
      if (filters.status) { where.push('i.status = ?'); p.push(filters.status); }
      for (const r of this.db.all(`SELECT i.* FROM inward i WHERE ${where.join(' AND ')} ORDER BY i.date_received DESC, i.id DESC LIMIT 300`, p)) {
        out.push({
          type: 'inward', id: r.id, number: r.inward_no, date: r.date_received, subject: r.subject, party: [r.sender_designation, r.sender_office || r.sender_name].filter(Boolean).join(', '),
          category: r.category_name, status: r.status, summary: r.summary, reference: r.reference_no, academic_year: r.academic_year, deleted: !!r.deleted_at,
        });
      }
    }
    out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (q) this.remember(q);
    return out;
  }

  remember(q) {
    const last = this.db.get('SELECT q FROM recent_searches ORDER BY id DESC LIMIT 1');
    if (last && last.q === q) return;
    this.db.run('INSERT INTO recent_searches(q) VALUES(?)', [q]);
    this.db.run('DELETE FROM recent_searches WHERE id NOT IN (SELECT id FROM recent_searches ORDER BY id DESC LIMIT 20)');
  }

  recent() {
    return this.db.all('SELECT q, MAX(at) AS at FROM recent_searches GROUP BY q ORDER BY at DESC LIMIT 10');
  }

  clearRecent() { this.db.run('DELETE FROM recent_searches'); }

  academicYears() {
    return this.db.all(`SELECT academic_year AS ay FROM letters WHERE academic_year IS NOT NULL UNION SELECT academic_year FROM inward WHERE academic_year IS NOT NULL ORDER BY 1 DESC`).map((r) => r.ay);
  }
}

module.exports = Search;
