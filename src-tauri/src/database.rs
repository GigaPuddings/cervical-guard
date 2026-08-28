use std::path::Path;

use rusqlite::{params, Connection};

use crate::messages::{msg, Language};
use crate::model::{AppSettings, BehaviorHistoryEvent, DailyStatistics, PersistedMeta};

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|error| error.to_string())?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        let database = Self {
            connection: Connection::open_in_memory().expect("in-memory database"),
        };
        database.migrate().expect("migration");
        database
    }

    fn migrate(&self) -> Result<(), String> {
        self.connection
            .execute_batch(
                "
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS monitoring_sessions (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                end_reason TEXT,
                model_bundle_version TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS behavior_events (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                event_type TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                duration_seconds INTEGER,
                confidence_bucket TEXT,
                reminder_action TEXT,
                FOREIGN KEY(session_id) REFERENCES monitoring_sessions(id)
            );
            CREATE TABLE IF NOT EXISTS daily_statistics (
                local_date TEXT PRIMARY KEY,
                seated_seconds INTEGER NOT NULL DEFAULT 0,
                longest_seated_seconds INTEGER NOT NULL DEFAULT 0,
                head_down_seconds INTEGER NOT NULL DEFAULT 0,
                suspected_phone_seconds INTEGER NOT NULL DEFAULT 0,
                break_count INTEGER NOT NULL DEFAULT 0,
                reminder_count INTEGER NOT NULL DEFAULT 0,
                dismissed_count INTEGER NOT NULL DEFAULT 0,
                snoozed_count INTEGER NOT NULL DEFAULT 0,
                away_seconds INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS model_registry (
                bundle_version TEXT PRIMARY KEY,
                manifest_json TEXT NOT NULL,
                installed_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 0
            );
            PRAGMA user_version = 1;
            ",
            )
            .map_err(|error| error.to_string())?;
        // 增量迁移：为已有数据库添加 away_seconds 列。
        // ALTER TABLE ADD COLUMN 在列已存在时会报错，因此先检查列是否存在。
        let has_column = self
            .connection
            .prepare("SELECT away_seconds FROM daily_statistics LIMIT 0")
            .is_ok();
        if !has_column {
            self.connection
                .execute(
                    "ALTER TABLE daily_statistics ADD COLUMN away_seconds INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        // 增量迁移：为已有数据库添加 away_count 列（今日离开次数）。
        let has_away_count = self
            .connection
            .prepare("SELECT away_count FROM daily_statistics LIMIT 0")
            .is_ok();
        if !has_away_count {
            self.connection
                .execute(
                    "ALTER TABLE daily_statistics ADD COLUMN away_count INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        // 增量迁移：记录“稍后提醒”次数，和关闭提醒分开保存。
        let has_snoozed_count = self
            .connection
            .prepare("SELECT snoozed_count FROM daily_statistics LIMIT 0")
            .is_ok();
        if !has_snoozed_count {
            self.connection
                .execute(
                    "ALTER TABLE daily_statistics ADD COLUMN snoozed_count INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn load_settings(&self) -> AppSettings {
        let mut settings: AppSettings = self.load_json("app_settings").unwrap_or_default();
        settings.normalize_for_current_version();
        settings
    }

    pub fn load_meta(&self) -> PersistedMeta {
        self.load_json("app_meta").unwrap_or_default()
    }

    fn load_json<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let json: String = self
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok()?;
        serde_json::from_str(&json).ok()
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        self.save_json("app_settings", settings)
    }

    pub fn save_meta(&self, meta: &PersistedMeta) -> Result<(), String> {
        self.save_json("app_meta", meta)
    }

    fn save_json<T: serde::Serialize>(&self, key: &str, value: &T) -> Result<(), String> {
        let json = serde_json::to_string(value).map_err(|error| error.to_string())?;
        self.connection.execute(
            "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![key, json],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn load_today(&self) -> DailyStatistics {
        let today = chrono::Local::now().date_naive().to_string();
        let mut item = self
            .connection
            .query_row(
                "SELECT local_date, seated_seconds, longest_seated_seconds, head_down_seconds,
                    suspected_phone_seconds, break_count, reminder_count, dismissed_count, snoozed_count, away_seconds, away_count
             FROM daily_statistics WHERE local_date = ?1",
                [today],
                map_statistics,
            )
            .unwrap_or_else(|_| DailyStatistics::today());
        if let Ok((dismissed_count, snoozed_count)) =
            self.reminder_action_counts_on(&item.local_date)
        {
            item.dismissed_count = item.dismissed_count.max(dismissed_count);
            item.snoozed_count = item.snoozed_count.max(snoozed_count);
        }
        item
    }

    pub fn save_daily(&self, item: &DailyStatistics) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO daily_statistics (
                local_date, seated_seconds, longest_seated_seconds, head_down_seconds,
                suspected_phone_seconds, break_count, reminder_count, dismissed_count, snoozed_count, away_seconds, away_count
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(local_date) DO UPDATE SET
                seated_seconds = excluded.seated_seconds,
                longest_seated_seconds = excluded.longest_seated_seconds,
                head_down_seconds = excluded.head_down_seconds,
                suspected_phone_seconds = excluded.suspected_phone_seconds,
                break_count = excluded.break_count,
                reminder_count = excluded.reminder_count,
                dismissed_count = excluded.dismissed_count,
                snoozed_count = excluded.snoozed_count,
                away_seconds = excluded.away_seconds,
                away_count = excluded.away_count",
                params![
                    item.local_date,
                    item.seated_seconds,
                    item.longest_seated_seconds,
                    item.head_down_seconds,
                    item.suspected_phone_seconds,
                    item.break_count,
                    item.reminder_count,
                    item.dismissed_count,
                    item.snoozed_count,
                    item.away_seconds,
                    item.away_count,
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn statistics(&self, days: u32) -> Result<Vec<DailyStatistics>, String> {
        let mut statement = self
            .connection
            .prepare(
                "WITH RECURSIVE dates(day, n) AS (
                SELECT date('now', 'localtime'), 1
                UNION ALL SELECT date(day, '-1 day'), n + 1 FROM dates WHERE n < ?1
             ),
             reminder_actions(local_date, dismissed_count, snoozed_count) AS (
                SELECT date(started_at, 'localtime'),
                       COALESCE(SUM(CASE WHEN reminder_action = 'dismissed' THEN 1 ELSE 0 END), 0),
                       COALESCE(SUM(CASE WHEN reminder_action = 'snoozed' THEN 1 ELSE 0 END), 0)
                FROM behavior_events
                WHERE event_type = 'reminder'
                  AND reminder_action IN ('dismissed', 'snoozed')
                GROUP BY date(started_at, 'localtime')
             )
             SELECT dates.day,
                    COALESCE(d.seated_seconds, 0), COALESCE(d.longest_seated_seconds, 0),
                    COALESCE(d.head_down_seconds, 0), COALESCE(d.suspected_phone_seconds, 0),
                    COALESCE(d.break_count, 0), COALESCE(d.reminder_count, 0),
                    MAX(COALESCE(d.dismissed_count, 0), COALESCE(e.dismissed_count, 0)),
                    MAX(COALESCE(d.snoozed_count, 0), COALESCE(e.snoozed_count, 0)),
                    COALESCE(d.away_seconds, 0), COALESCE(d.away_count, 0)
             FROM dates LEFT JOIN daily_statistics d ON d.local_date = dates.day
             LEFT JOIN reminder_actions e ON e.local_date = dates.day
             ORDER BY dates.day ASC",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([days.clamp(1, 366)], map_statistics)
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn record_event(
        &self,
        event_type: &str,
        duration: u64,
        action: Option<&str>,
    ) -> Result<(), String> {
        let now = chrono::Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO behavior_events (id, event_type, started_at, duration_seconds, reminder_action)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), event_type, now, duration, action],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    fn reminder_action_counts_on(&self, local_date: &str) -> Result<(u64, u64), String> {
        self.connection
            .query_row(
                "SELECT
                    COALESCE(SUM(CASE WHEN reminder_action = 'dismissed' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN reminder_action = 'snoozed' THEN 1 ELSE 0 END), 0)
                 FROM behavior_events
                 WHERE event_type = 'reminder'
                    AND reminder_action IN ('dismissed', 'snoozed')
                    AND date(started_at, 'localtime') = date(?1)",
                [local_date],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())
    }

    pub fn record_completed_event(
        &self,
        event_type: &str,
        started_at: &str,
        duration: u64,
        action: Option<&str>,
    ) -> Result<(), String> {
        let ended_at = chrono::Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO behavior_events (id, event_type, started_at, ended_at, duration_seconds, reminder_action)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![uuid::Uuid::new_v4().to_string(), event_type, started_at, ended_at, duration, action],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn start_event(&self, event_type: &str, action: Option<&str>) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now().to_rfc3339();
        self.connection
            .execute(
                "INSERT INTO behavior_events (id, event_type, started_at, reminder_action)
             VALUES (?1, ?2, ?3, ?4)",
                params![id, event_type, started_at, action],
            )
            .map_err(|error| error.to_string())?;
        Ok(id)
    }

    pub fn finish_event(
        &self,
        id: &str,
        duration: u64,
        action: Option<&str>,
    ) -> Result<(), String> {
        let ended_at = chrono::Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE behavior_events SET ended_at = ?2, duration_seconds = ?3, reminder_action = ?4
             WHERE id = ?1",
            params![id, ended_at, duration, action],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn behavior_history(&self, days: u32) -> Result<Vec<BehaviorHistoryEvent>, String> {
        let mut statement = self.connection.prepare(
            "SELECT id, event_type, started_at, ended_at, COALESCE(duration_seconds, 0), reminder_action
             FROM behavior_events
             WHERE date(started_at) >= date('now', 'localtime', ?1)
             ORDER BY started_at DESC LIMIT 500",
        ).map_err(|error| error.to_string())?;
        let lookback = format!("-{} days", days.clamp(1, 366));
        let rows = statement
            .query_map([lookback], |row| {
                Ok(BehaviorHistoryEvent {
                    id: row.get(0)?,
                    event_type: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    action: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn behavior_history_for_date(
        &self,
        local_date: &str,
    ) -> Result<Vec<BehaviorHistoryEvent>, String> {
        chrono::NaiveDate::parse_from_str(local_date, "%Y-%m-%d")
            .map_err(|_| msg::ERR_EVENT_DATE.get(Language::ZhCn).to_string())?;
        let mut statement = self.connection.prepare(
            "SELECT id, event_type, started_at, ended_at, COALESCE(duration_seconds, 0), reminder_action
             FROM behavior_events
             WHERE date(started_at, 'localtime') = date(?1)
             ORDER BY started_at DESC",
        ).map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([local_date], |row| {
                Ok(BehaviorHistoryEvent {
                    id: row.get(0)?,
                    event_type: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    action: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn export_events(&self, days: u32) -> Result<Vec<BehaviorHistoryEvent>, String> {
        self.behavior_history(days)
    }

    pub fn delete_statistics(&self) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM behavior_events", [])
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM monitoring_sessions", [])
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM daily_statistics", [])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    }
}

fn map_statistics(row: &rusqlite::Row<'_>) -> rusqlite::Result<DailyStatistics> {
    Ok(DailyStatistics {
        local_date: row.get(0)?,
        seated_seconds: row.get(1)?,
        longest_seated_seconds: row.get(2)?,
        head_down_seconds: row.get(3)?,
        suspected_phone_seconds: row.get(4)?,
        break_count: row.get(5)?,
        reminder_count: row.get(6)?,
        dismissed_count: row.get(7)?,
        snoozed_count: row.get(8)?,
        away_seconds: row.get(9)?,
        away_count: row.get(10)?,
    })
}

#[cfg(test)]
mod tests;
