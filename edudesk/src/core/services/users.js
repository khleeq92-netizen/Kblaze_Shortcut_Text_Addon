'use strict';
/**
 * Users and roles. The first release runs in single-user mode (the "owner" account),
 * but every permission check already goes through roles so multi-user login can be
 * added without changing the data model.
 */
const { UserError, json } = require('../util');
const { PERMISSIONS } = require('../seed');

class Users {
  constructor(app) { this.app = app; this.db = app.db; }

  permissions() { return PERMISSIONS.map(([key, label]) => ({ key, label })); }

  roles() { return this.db.all('SELECT * FROM roles ORDER BY id').map((r) => ({ ...r, permissions: json(r.permissions, []) })); }

  list() { return this.db.all('SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id'); }

  saveRole(input) {
    const user = this.app.require('settings.manage');
    const role = input.id ? this.db.get('SELECT * FROM roles WHERE id=?', [input.id]) : null;
    if (role && role.name === 'Owner') throw new UserError('The Owner role always has every permission.');
    const perms = (input.permissions || []).filter((p) => PERMISSIONS.some((x) => x[0] === p));
    if (role) this.db.run('UPDATE roles SET permissions=? WHERE id=?', [JSON.stringify(perms), role.id]);
    else {
      if (!input.name) throw new UserError('Role name is required.');
      this.db.run('INSERT INTO roles(name, permissions) VALUES(?,?)', [input.name, JSON.stringify(perms)]);
    }
    this.app.audit(user, 'role.save', 'role', input.id || null, { name: input.name, perms });
    return this.roles();
  }

  saveUser(input) {
    const user = this.app.require('settings.manage');
    if (!input.username || !/^[a-z0-9._-]{3,30}$/i.test(input.username)) throw new UserError('Username must be 3–30 letters, numbers, dots or dashes.');
    if (!input.display_name) throw new UserError('Display name is required.');
    if (input.id) {
      const u = this.db.get('SELECT * FROM users WHERE id=?', [input.id]);
      if (u.username === 'owner' && (input.active === 0 || input.username !== 'owner')) throw new UserError('The owner account cannot be renamed or disabled.');
      this.db.run('UPDATE users SET username=?, display_name=?, role_id=?, active=? WHERE id=?', [input.username, input.display_name, input.role_id, input.active === 0 ? 0 : 1, input.id]);
    } else {
      this.db.run('INSERT INTO users(username, display_name, role_id) VALUES(?,?,?)', [input.username, input.display_name, input.role_id]);
    }
    this.app.audit(user, 'user.save', 'user', input.id || null, { username: input.username });
    return this.list();
  }

  auditLog({ entity, limit = 300 } = {}) {
    this.app.require('registers.view');
    return this.db.all(`SELECT * FROM audit_log ${entity ? 'WHERE entity = ?' : ''} ORDER BY id DESC LIMIT ?`, entity ? [entity, limit] : [limit])
      .map((a) => ({ ...a, details: json(a.details, null) }));
  }
}

module.exports = Users;
