const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "steel.db");
console.log("📁 Database path:", dbPath);

// Видаляємо стару БД для чистоти
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("🗑️ Видалено стару базу даних");
}

const db = new Database(dbPath);

// Створюємо таблиці
db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        total_weight REAL NOT NULL,
        total_sum INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER,
        percentage INTEGER NOT NULL,
        weight REAL NOT NULL,
        coefficient REAL NOT NULL,
        sum INTEGER NOT NULL,
        FOREIGN KEY (receipt_id) REFERENCES receipts (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// Додаємо початкові налаштування
const defaultCoefficient = 2.3;
const existingCoeff = db.prepare("SELECT value FROM settings WHERE key = 'coefficient'").get();
if (!existingCoeff) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("coefficient", defaultCoefficient.toString());
}

console.log("✅ База даних ініціалізована");
console.log("📊 Таблиці створено:",
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));

module.exports = db;