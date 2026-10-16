'use strict';

/**
 * Migration 20261016 — "My Portal": self-service attendance and leave for EVERY login.
 *
 *   staff_attendance   one row per user per day: check-in / check-out time (server clock),
 *                      worked minutes, status, and any Admin/HR correction.
 *   staff_leaves       leave applications by a user, decided by Admin / HR.
 *
 * Keyed by user (not employee), so admin, HR, PM, contractor, finance... all have it.
 * Deliberately separate from attendance_records, which drives labour wages: marking your
 * own attendance can never create a labour cost. Idempotent.
 */
async function up(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
      user_id          BIGINT UNSIGNED NOT NULL,
      attendance_date  DATE            NOT NULL,
      check_in_at      DATETIME        NULL,
      check_out_at     DATETIME        NULL,
      work_minutes     INT UNSIGNED    NULL,
      status           VARCHAR(20)     NOT NULL DEFAULT 'present',
      is_late          TINYINT(1)      NOT NULL DEFAULT 0,
      check_in_note    VARCHAR(255)    NULL,
      check_out_note   VARCHAR(255)    NULL,
      corrected_by     BIGINT UNSIGNED NULL,
      correction_note  VARCHAR(255)    NULL,
      created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_staff_attendance_user_day (user_id, attendance_date),
      KEY idx_staff_attendance_day (attendance_date),
      CONSTRAINT fk_staff_att_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS staff_leaves (
      id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
      user_id        BIGINT UNSIGNED NOT NULL,
      leave_type     VARCHAR(20)     NOT NULL,
      start_date     DATE            NOT NULL,
      end_date       DATE            NOT NULL,
      half_day       TINYINT(1)      NOT NULL DEFAULT 0,
      days           DECIMAL(5,1)    NOT NULL,
      reason         TEXT            NULL,
      status         VARCHAR(20)     NOT NULL DEFAULT 'pending',
      decided_by     BIGINT UNSIGNED NULL,
      decided_at     DATETIME        NULL,
      decision_note  VARCHAR(255)    NULL,
      created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_staff_leaves_user (user_id, status),
      KEY idx_staff_leaves_dates (start_date, end_date),
      CONSTRAINT fk_staff_leave_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
