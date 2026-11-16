'use strict';
const { todayISO, academicYear } = require('../util');

class Dashboard {
  constructor(app) { this.app = app; this.db = app.db; }

  stats() {
    const today = todayISO();
    const month = today.slice(0, 7);
    const ay = academicYear(today, this.app.settings.get('academic').startMonth);
    const n = (sql, p = []) => this.db.get(sql, p).n;
    const L = "FROM letters WHERE deleted_at IS NULL";
    return {
      academicYear: ay,
      totalOutward: n(`SELECT COUNT(*) AS n ${L} AND outward_no IS NOT NULL AND status <> 'Cancelled'`),
      outwardThisYear: n(`SELECT COUNT(*) AS n ${L} AND outward_no IS NOT NULL AND academic_year = ?`, [ay]),
      totalInward: n('SELECT COUNT(*) AS n FROM inward WHERE deleted_at IS NULL'),
      dispatchedThisMonth: n(`SELECT COUNT(*) AS n ${L} AND dispatch_date LIKE ?`, [`${month}%`]),
      drafts: n(`SELECT COUNT(*) AS n ${L} AND status IN ('Draft','Generated') AND archive_status <> 'Complete'`),
      pendingApprovals: n(`SELECT COUNT(*) AS n ${L} AND status = 'Awaiting Approval'`),
      readyForDispatch: n(`SELECT COUNT(*) AS n ${L} AND dispatch_status = 'Ready for Dispatch' AND status <> 'Cancelled'`),
      ackPending: n(`SELECT COUNT(*) AS n ${L} AND status <> 'Cancelled' AND ack_received_date IS NULL AND (ack_status = 'Pending' OR dispatch_status IN ('Delivered','Acknowledgement Pending'))`),
      archiveIncomplete: n(`SELECT COUNT(*) AS n ${L} AND archive_status = 'Incomplete'`),
      pendingInward: n("SELECT COUNT(*) AS n FROM inward WHERE deleted_at IS NULL AND status NOT IN ('Replied','Completed','Archived')"),
      overdueReplies: n("SELECT COUNT(*) AS n FROM inward WHERE deleted_at IS NULL AND reply_required = 1 AND reply_deadline < ? AND status NOT IN ('Replied','Completed','Archived')", [today]),
      recentLetters: this.db.all(`SELECT id, outward_no, subject, recipient_office, recipient_designation, letter_date, status, archive_status ${L} ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 8`),
      recentInward: this.db.all('SELECT id, inward_no, subject, sender_office, sender_name, date_received, status, reply_deadline FROM inward WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 8'),
      overdueList: this.db.all("SELECT id, inward_no, subject, sender_office, reply_deadline FROM inward WHERE deleted_at IS NULL AND reply_required = 1 AND reply_deadline < ? AND status NOT IN ('Replied','Completed','Archived') ORDER BY reply_deadline LIMIT 8", [today]),
      monthly: this.db.all(`SELECT substr(letter_date,1,7) AS m, COUNT(*) AS n ${L} AND outward_no IS NOT NULL AND academic_year = ? GROUP BY m ORDER BY m`, [ay]),
      lastBackup: this.db.get('SELECT created_at, verified, path FROM backups WHERE verified = 1 ORDER BY id DESC LIMIT 1') || null,
    };
  }
}

module.exports = Dashboard;
