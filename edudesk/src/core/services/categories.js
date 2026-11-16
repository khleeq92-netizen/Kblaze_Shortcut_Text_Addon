'use strict';
const { UserError, sanitizeFileName } = require('../util');

class Categories {
  constructor(app) { this.app = app; this.db = app.db; }

  list({ includeInactive = true } = {}) {
    const cats = this.db.all(`SELECT * FROM categories WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'} ORDER BY sort_order, id`);
    const subs = this.db.all(`SELECT * FROM subcategories WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND active = 1'} ORDER BY sort_order, id`);
    return cats.map((c) => ({ ...c, subcategories: subs.filter((s) => s.category_id === c.id) }));
  }

  get(id) {
    return this.db.get('SELECT * FROM categories WHERE id = ?', [id]);
  }

  save(input) {
    const user = this.app.require('settings.manage');
    const name = String(input.name || '').trim();
    if (!name) throw new UserError('Category name is required.');
    const code = String(input.code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'CAT').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const folder = sanitizeFileName(input.folder_name || name, 40);
    return this.db.tx(() => {
      const dup = this.db.get('SELECT id FROM categories WHERE code = ? AND deleted_at IS NULL AND id <> ?', [code, input.id || 0]);
      if (dup) throw new UserError(`Another category already uses the code "${code}".`);
      let id = input.id;
      if (id) {
        this.db.run('UPDATE categories SET name=?, code=?, folder_name=? WHERE id=?', [name, code, folder, id]);
      } else {
        const max = this.db.get('SELECT COALESCE(MAX(sort_order),0) AS m FROM categories').m;
        id = this.db.run('INSERT INTO categories(name, code, folder_name, sort_order) VALUES(?,?,?,?)', [name, code, folder, max + 1]).lastInsertRowid;
      }
      this.app.audit(user, input.id ? 'category.update' : 'category.create', 'category', id, { name, code, folder });
      this.app.emitChange('categories');
      return this.get(id);
    });
  }

  setActive(id, active) {
    const user = this.app.require('settings.manage');
    this.db.run('UPDATE categories SET active=? WHERE id=?', [active ? 1 : 0, id]);
    this.app.audit(user, active ? 'category.enable' : 'category.disable', 'category', id);
    this.app.emitChange('categories');
  }

  usage(id) {
    const q = (sql) => this.db.get(sql, [id]).n;
    return {
      letters: q('SELECT COUNT(*) AS n FROM letters WHERE category_id = ?'),
      inward: q('SELECT COUNT(*) AS n FROM inward WHERE category_id = ?'),
      templates: q('SELECT COUNT(*) AS n FROM templates WHERE category_id = ? AND deleted_at IS NULL'),
      recipients: q('SELECT COUNT(*) AS n FROM recipients WHERE category_id = ?'),
    };
  }

  /** Delete only when nothing refers to the category; otherwise it must be disabled. */
  remove(id) {
    const user = this.app.require('settings.manage');
    const u = this.usage(id);
    if (u.letters || u.inward || u.templates) {
      throw new UserError(`This category is used by ${u.letters} letter(s), ${u.inward} inward entr(ies) and ${u.templates} template(s). Disable it instead so historical records stay intact.`);
    }
    this.db.tx(() => {
      this.db.run('UPDATE recipients SET category_id = NULL WHERE category_id = ?', [id]);
      this.db.run("UPDATE subcategories SET deleted_at = datetime('now','localtime') WHERE category_id = ?", [id]);
      this.db.run("UPDATE categories SET deleted_at = datetime('now','localtime'), active = 0 WHERE id = ?", [id]);
      this.app.audit(user, 'category.delete', 'category', id);
    });
    this.app.emitChange('categories');
  }

  reorder(ids) {
    const user = this.app.require('settings.manage');
    this.db.tx(() => ids.forEach((id, i) => this.db.run('UPDATE categories SET sort_order=? WHERE id=?', [i + 1, id])));
    this.app.audit(user, 'category.reorder', 'category', null, { ids });
    this.app.emitChange('categories');
  }

  saveSub(input) {
    const user = this.app.require('settings.manage');
    const name = String(input.name || '').trim();
    if (!name) throw new UserError('Subcategory name is required.');
    return this.db.tx(() => {
      let id = input.id;
      if (id) this.db.run('UPDATE subcategories SET name=? WHERE id=?', [name, id]);
      else {
        const max = this.db.get('SELECT COALESCE(MAX(sort_order),0) AS m FROM subcategories WHERE category_id=?', [input.category_id]).m;
        id = this.db.run('INSERT INTO subcategories(category_id, name, sort_order) VALUES(?,?,?)', [input.category_id, name, max + 1]).lastInsertRowid;
      }
      this.app.audit(user, input.id ? 'subcategory.update' : 'subcategory.create', 'subcategory', id, { name });
      this.app.emitChange('categories');
      return this.db.get('SELECT * FROM subcategories WHERE id=?', [id]);
    });
  }

  setSubActive(id, active) {
    const user = this.app.require('settings.manage');
    this.db.run('UPDATE subcategories SET active=? WHERE id=?', [active ? 1 : 0, id]);
    this.app.audit(user, active ? 'subcategory.enable' : 'subcategory.disable', 'subcategory', id);
    this.app.emitChange('categories');
  }

  removeSub(id) {
    const user = this.app.require('settings.manage');
    const n = this.db.get('SELECT COUNT(*) AS n FROM letters WHERE subcategory_id = ?', [id]).n
      + this.db.get('SELECT COUNT(*) AS n FROM templates WHERE subcategory_id = ? AND deleted_at IS NULL', [id]).n;
    if (n) throw new UserError('This subcategory is used by existing letters or templates. Disable it instead.');
    this.db.run("UPDATE subcategories SET deleted_at = datetime('now','localtime'), active = 0 WHERE id = ?", [id]);
    this.app.audit(user, 'subcategory.delete', 'subcategory', id);
    this.app.emitChange('categories');
  }

  reorderSubs(ids) {
    this.app.require('settings.manage');
    this.db.tx(() => ids.forEach((id, i) => this.db.run('UPDATE subcategories SET sort_order=? WHERE id=?', [i + 1, id])));
    this.app.emitChange('categories');
  }
}

module.exports = Categories;
