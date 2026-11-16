'use strict';
const fs = require('fs');
const path = require('path');
const docx = require('../docx');
const { convertToLetterhead, makeReusableLetter } = require('../docxBuilder');
const { UserError, ensureDir, sanitizeFileName, sha256Buffer, json } = require('../util');

class Templates {
  constructor(app) { this.app = app; this.db = app.db; }

  dir(templateId) {
    return ensureDir(path.join(this.app.documentsRoot(), 'Templates', 'Letters', String(templateId)));
  }

  /**
   * kind: 'template' (letterheads + letter formats, default), 'library' (previous letters reused as
   * they are) or 'all'.
   */
  list({ categoryId, includeInactive = false, q = '', kind = 'template' } = {}) {
    const where = ['t.deleted_at IS NULL'];
    const params = [];
    if (kind !== 'all') { where.push('t.kind = ?'); params.push(kind); }
    if (!includeInactive) where.push('t.active = 1');
    if (categoryId) { where.push('(t.category_id = ? OR t.category_id IS NULL)'); params.push(categoryId); }
    if (q) { where.push('(t.name LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    return this.db.all(`SELECT t.*, c.name AS category_name, s.name AS subcategory_name, v.version AS version, v.uploaded_at AS version_uploaded_at, v.placeholders
      FROM templates t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN subcategories s ON s.id = t.subcategory_id
      LEFT JOIN template_versions v ON v.id = t.current_version_id
      WHERE ${where.join(' AND ')} ORDER BY t.is_letterhead DESC, c.sort_order, t.name`, params)
      .map((t) => ({ ...t, placeholders: json(t.placeholders, []), meta: json(t.meta, {}) }));
  }

  get(id) {
    const t = this.db.get('SELECT * FROM templates WHERE id=?', [id]);
    if (!t) return null;
    t.meta = json(t.meta, {});
    t.versions = this.db.all('SELECT * FROM template_versions WHERE template_id=? ORDER BY version DESC', [id]).map((v) => ({ ...v, placeholders: json(v.placeholders, []) }));
    return t;
  }

  versionPath(versionId) {
    const v = this.db.get('SELECT * FROM template_versions WHERE id=?', [versionId]);
    if (!v) throw new UserError('Template version not found.');
    const p = this.app.resolve(v.file_path);
    if (!fs.existsSync(p)) throw new UserError(`Template file is missing: ${p}`);
    return { version: v, path: p };
  }

  /** Create a template from a .docx on disk (a letterhead, an old letter, a format). */
  create(meta, filePath, { user, sample = false, buffer } = {}) {
    user = user || this.app.require('templates.manage');
    if (!meta.name || !String(meta.name).trim()) throw new UserError('Template name is required.');
    let clean = docx.sanitizeTemplate(buffer || fs.readFileSync(filePath), path.basename(filePath));
    if (meta.convertBody) {
      // keep letterhead (headers, footers, logo, borders, margins) and insert the EduDesk letter layout
      const converted = convertToLetterhead(clean.buffer, meta.language || 'en');
      clean = { ...docx.sanitizeTemplate(converted, 'converted.docx'), removedParts: clean.removedParts };
    }
    if (!clean.placeholders.length && meta.kind !== 'library') clean.warning = 'This document contains no {{placeholders}}. Letters made from it will not be filled automatically; add placeholders such as {{subject}} in Word, or use "Use as letterhead".';
    return this.db.tx(() => {
      const id = this.db.run(`INSERT INTO templates(name, category_id, subcategory_id, language, description, default_subject, default_body, is_letterhead, is_sample, kind, variant_group, sample_key, meta)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [meta.name.trim(), meta.category_id || null, meta.subcategory_id || null, meta.language || 'en', meta.description || null,
        meta.default_subject || null, meta.default_body || null, meta.is_letterhead ? 1 : 0, sample ? 1 : 0, meta.kind || 'template', meta.variant_group || null,
        meta.sample_key || null, meta.meta ? JSON.stringify(meta.meta) : null]).lastInsertRowid;
      const vId = this.addVersionFile(id, 1, clean, path.basename(filePath), meta.note || 'Initial version', user);
      this.db.run('UPDATE templates SET current_version_id=? WHERE id=?', [vId, id]);
      this.app.audit(user, 'template.create', 'template', id, { name: meta.name, removedParts: clean.removedParts });
      this.app.emitChange('templates');
      return { template: this.get(id), removedParts: clean.removedParts, placeholders: clean.placeholders, warning: clean.warning || null };
    });
  }

  /** Inspect a .docx before importing it (placeholders found, macros, etc.). */
  inspect(filePath) {
    const clean = docx.sanitizeTemplate(fs.readFileSync(filePath), path.basename(filePath));
    return { placeholders: clean.placeholders, removedParts: clean.removedParts, text: docx.extractText(clean.buffer).slice(0, 1500) };
  }

  addVersionFile(templateId, version, clean, originalName, note, user) {
    const dest = path.join(this.dir(templateId), `v${version}_${sanitizeFileName(path.basename(originalName, path.extname(originalName)), 60)}.docx`);
    if (fs.existsSync(dest)) throw new Error(`Template file already exists: ${dest}`);
    fs.writeFileSync(dest, clean.buffer, { flag: 'wx' });
    return this.db.run(`INSERT INTO template_versions(template_id, version, file_path, original_name, sha256, placeholders, note, uploaded_by)
      VALUES(?,?,?,?,?,?,?,?)`, [templateId, version, this.app.toStored(dest), originalName, sha256Buffer(clean.buffer), JSON.stringify(clean.placeholders), note || null, user]).lastInsertRowid;
  }

  /** Upload a replacement file. Older versions are kept; letters keep the version they used. */
  uploadVersion(templateId, filePath, note) {
    const user = this.app.require('templates.manage');
    const clean = docx.sanitizeTemplate(fs.readFileSync(filePath), path.basename(filePath));
    return this.db.tx(() => {
      const max = this.db.get('SELECT COALESCE(MAX(version),0) AS m FROM template_versions WHERE template_id=?', [templateId]).m;
      const vId = this.addVersionFile(templateId, max + 1, clean, path.basename(filePath), note, user);
      this.db.run("UPDATE templates SET current_version_id=?, updated_at=datetime('now','localtime') WHERE id=?", [vId, templateId]);
      this.app.audit(user, 'template.version', 'template', templateId, { version: max + 1, note });
      this.app.emitChange('templates');
      return { template: this.get(templateId), removedParts: clean.removedParts, placeholders: clean.placeholders };
    });
  }

  setCurrentVersion(templateId, versionId) {
    const user = this.app.require('templates.manage');
    const v = this.db.get('SELECT * FROM template_versions WHERE id=? AND template_id=?', [versionId, templateId]);
    if (!v) throw new UserError('Version not found.');
    this.db.run('UPDATE templates SET current_version_id=? WHERE id=?', [versionId, templateId]);
    this.app.audit(user, 'template.activateVersion', 'template', templateId, { version: v.version });
    this.app.emitChange('templates');
  }

  update(id, meta) {
    const user = this.app.require('templates.manage');
    if (!meta.name || !String(meta.name).trim()) throw new UserError('Template name is required.');
    this.db.run(`UPDATE templates SET name=?, category_id=?, subcategory_id=?, language=?, description=?, default_subject=?, default_body=?, is_letterhead=?, active=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [meta.name.trim(), meta.category_id || null, meta.subcategory_id || null, meta.language || 'en', meta.description || null, meta.default_subject || null, meta.default_body || null, meta.is_letterhead ? 1 : 0, meta.active === 0 || meta.active === false ? 0 : 1, id]);
    this.app.audit(user, 'template.update', 'template', id, { name: meta.name });
    this.app.emitChange('templates');
    return this.get(id);
  }

  duplicate(id, newName) {
    const user = this.app.require('templates.manage');
    const t = this.get(id);
    if (!t) throw new UserError('Template not found.');
    const { path: p } = this.versionPath(t.current_version_id);
    return this.create({ ...t, name: newName || `${t.name} (copy)`, note: `Copied from "${t.name}"` }, p, { user });
  }

  remove(id) {
    const user = this.app.require('templates.manage');
    // Soft delete: letters that used it keep their link and the file stays on disk.
    this.db.run("UPDATE templates SET deleted_at=datetime('now','localtime'), active=0 WHERE id=?", [id]);
    this.app.audit(user, 'template.delete', 'template', id);
    this.app.emitChange('templates');
  }

  /**
   * Install or update the bundled sample templates. Runs at every start and is idempotent: each
   * sample is identified by its key, so new samples (e.g. Marathi versions) appear after an update,
   * and samples installed by an older version get their language group and default text.
   */
  async installBundledSamples() {
    const dir = path.join(this.app.resourcesDir, 'templates');
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return 0;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let n = 0;
    for (const item of manifest.templates) {
      const key = item.key || item.file;
      const cat = item.category ? this.db.get('SELECT id FROM categories WHERE code=?', [item.category]) : null;
      const sub = cat && item.subcategory ? this.db.get('SELECT id FROM subcategories WHERE category_id=? AND name=?', [cat.id, item.subcategory]) : null;
      const existing = this.db.get('SELECT * FROM templates WHERE sample_key=?', [key])
        || this.db.get('SELECT * FROM templates WHERE is_sample=1 AND sample_key IS NULL AND name=? AND language=?', [item.name, item.language || 'en']);
      if (existing) {
        // adopt / refresh an installed sample without touching anything the user changed
        this.db.run('UPDATE templates SET sample_key=?, variant_group=COALESCE(variant_group, ?) WHERE id=?', [key, item.group || null, existing.id]);
        if (!existing.default_body && item.body) this.db.run('UPDATE templates SET default_body=?, default_subject=COALESCE(default_subject, ?) WHERE id=?', [item.body, item.subject || null, existing.id]);
        continue;
      }
      const file = path.join(dir, item.file);
      if (!fs.existsSync(file)) continue;
      const res = this.create({
        name: item.name, category_id: cat && cat.id, subcategory_id: sub && sub.id, language: item.language || 'en',
        description: item.description, default_subject: item.subject, default_body: item.body, is_letterhead: item.letterhead, note: 'Bundled sample (editable)',
        variant_group: item.group || null, sample_key: key,
      }, file, { user: 'system', sample: true });
      if (item.letterhead && !this.app.settings.get('letter').defaultTemplateId) this.app.settings.set('letter', { defaultTemplateId: res.template.id });
      n++;
    }
    return n;
  }

  /** The same template in another language (same variant group), if one exists. */
  variant(templateId, language) {
    const t = this.db.get('SELECT * FROM templates WHERE id=?', [templateId]);
    if (!t || !t.variant_group) return null;
    const v = this.db.get('SELECT id FROM templates WHERE variant_group=? AND language=? AND deleted_at IS NULL AND active=1 ORDER BY id LIMIT 1', [t.variant_group, language]);
    return v ? this.get(v.id) : null;
  }

  // ---------- previous letters (the college's own letters, reused as they are) ----------
  guessCategory(text, fileName) {
    const t = `${fileName} ${text}`;
    const code = /udise|s0[23]\b|so2/i.test(t) && /गटशिक्षणाधिकारी|gatshikshan|beo|block/i.test(t) ? 'BEO'
      : /udise/i.test(t) ? 'UDISE'
        : /विभागीय सचिव|divisional (secretary|board)|माध्यमिक व उच्च माध्यमिक शिक्षण मंडळ|hsc|एच\.?एस\.?सी|मंडळ मान्यता/i.test(t) ? 'HSC'
          : /गटशिक्षणाधिकारी|gatshikshan|पंचायत समिती|block education/i.test(t) ? 'BEO'
            : /जिल्हा परिषद|zilla parishad|शिक्षणाधिकारी|shikshanadhikari/i.test(t) ? 'ZP'
              : 'GEN';
    const c = this.db.get('SELECT id FROM categories WHERE code=? AND deleted_at IS NULL', [code]) || this.db.get('SELECT id FROM categories WHERE code=\'GEN\'');
    return c ? c.id : null;
  }

  /**
   * Import previous letters (.docx) so they can be reused: the outward number and the date in the
   * top line become automatic; the rest of each letter stays exactly as it was written.
   */
  importPreviousLetters(filePaths) {
    const user = this.app.require('templates.manage');
    const report = [];
    for (const f of filePaths) {
      const name = path.basename(f);
      try {
        if (!/\.docx$/i.test(name) || name.startsWith('~$')) { report.push({ file: name, ok: false, error: 'Not a .docx file' }); continue; }
        const original = fs.readFileSync(f);
        const sourceSha = sha256Buffer(original);
        const dup = this.db.all("SELECT id, meta FROM templates WHERE kind='library' AND deleted_at IS NULL").find((r) => json(r.meta, {}).sourceSha === sourceSha);
        if (dup) { report.push({ file: name, ok: false, skipped: true, error: 'Already imported' }); continue; }
        const clean = docx.sanitizeTemplate(original, name);
        const { buffer, meta } = makeReusableLetter(clean.buffer);
        const text = docx.extractText(buffer);
        const title = name.replace(/\.docx$/i, '').replace(/^\d+\s+[A-Za-z_]+\s*-\s*\d+\s*-\s*/, '').trim();
        const res = this.create({
          name: title, kind: 'library', category_id: this.guessCategory(text.slice(0, 3000), name), language: meta.language,
          default_subject: meta.subject || title, description: meta.subject || null,
          meta: { ...meta, sourceSha, sourceFile: name }, note: `Imported from ${name}`,
        }, f, { user, buffer });
        report.push({ file: name, ok: true, id: res.template.id, refFound: meta.refFound, dateFound: meta.dateFound, lineAdded: !!meta.lineAdded });
      } catch (e) {
        report.push({ file: name, ok: false, error: e.message });
      }
    }
    this.app.audit(user, 'library.import', 'template', null, { files: filePaths.length, imported: report.filter((r) => r.ok).length });
    this.app.emitChange('templates');
    return report;
  }

  importPreviousFolder(dir) {
    if (!dir || !fs.existsSync(dir)) throw new UserError('Folder not found.');
    const files = fs.readdirSync(dir).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$')).sort().map((f) => path.join(dir, f));
    if (!files.length) throw new UserError('No Word (.docx) files were found in that folder.');
    return this.importPreviousLetters(files);
  }

  // ---------- saved text snippets ("frequently used letter content") ----------
  listSnippets(categoryId) {
    return this.db.all(`SELECT * FROM snippets ${categoryId ? 'WHERE category_id = ? OR category_id IS NULL' : ''} ORDER BY title`, categoryId ? [categoryId] : []);
  }
  saveSnippet(s) {
    const user = this.app.require('letters.create');
    if (!s.title || !s.body) throw new UserError('Snippet title and text are required.');
    let id = s.id;
    if (id) this.db.run('UPDATE snippets SET title=?, body=?, category_id=?, language=? WHERE id=?', [s.title, s.body, s.category_id || null, s.language || 'en', id]);
    else id = this.db.run('INSERT INTO snippets(title, body, category_id, language) VALUES(?,?,?,?)', [s.title, s.body, s.category_id || null, s.language || 'en']).lastInsertRowid;
    this.app.audit(user, 'snippet.save', 'snippet', id);
    return this.db.get('SELECT * FROM snippets WHERE id=?', [id]);
  }
  removeSnippet(id) {
    const user = this.app.require('letters.create');
    this.db.run('DELETE FROM snippets WHERE id=?', [id]);
    this.app.audit(user, 'snippet.delete', 'snippet', id);
  }
}

module.exports = Templates;
