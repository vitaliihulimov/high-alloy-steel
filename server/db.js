const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "steel.db");
console.log("📁 Database path:", dbPath);

// Перевіряємо чи існує БД
const dbExists = fs.existsSync(dbPath);

// Відкриваємо БД
const db = new Database(dbPath);

// Встановлюємо прагми
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    console.log("⚙️ Додано базовий коефіцієнт за замовчуванням");
}

// Функція для резервного копіювання
function backupDatabase() {
    try {
        const backupPath = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupPath, `steel-${timestamp}.db`);

        // Закриваємо поточне з'єднання
        db.close();

        // Копіюємо файл
        fs.copyFileSync(dbPath, backupFile);
        console.log(`💾 Резервну копію збережено: ${backupFile}`);

        // Відкриваємо знову
        const newDb = new Database(dbPath);
        newDb.pragma('journal_mode = WAL');
        newDb.pragma('foreign_keys = ON');

        return newDb;
    } catch (error) {
        console.error('❌ Помилка резервного копіювання:', error);
        return db;
    }
}

// Робимо резервну копію раз на день (якщо є дані)
const receiptsCount = db.prepare("SELECT COUNT(*) as count FROM receipts").get();
if (receiptsCount.count > 0) {
    // Перевіряємо коли була остання резервна копія
    const backupsDir = path.join(__dirname, 'backups');
    if (fs.existsSync(backupsDir)) {
        const backups = fs.readdirSync(backupsDir).filter(f => f.startsWith('steel-'));
        if (backups.length === 0) {
            // backupDatabase(); // Розкоментуйте якщо треба автоматичний бекап
        }
    }
}

console.log("✅ База даних ініціалізована");
console.log(`📦 Всього чеків: ${receiptsCount.count}`);

module.exports = db;