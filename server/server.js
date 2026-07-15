require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            console.log('❌ CORS blocked for:', origin);
            return callback(null, false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());

// ====== PostgreSQL ======
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

console.log("🐘 Підключення до PostgreSQL...");

// Часовий пояс для звітів "за день"
const REPORT_TIMEZONE = 'Europe/Kyiv';

// Postgres повертає NUMERIC як рядки через драйвер pg — приводимо до чисел,
// щоб фронтенд міг безпечно викликати .toFixed()/.toLocaleString()
function normalizeReceipt(receipt) {
    return {
        ...receipt,
        total_weight: Number(receipt.total_weight),
        total_sum: Number(receipt.total_sum),
        items: (receipt.items || []).map(item => ({
            ...item,
            weight: Number(item.weight),
            coefficient: Number(item.coefficient),
            sum: Number(item.sum)
        }))
    };
}

// ====== ІНІЦІАЛІЗАЦІЯ ТАБЛИЦЬ ======
const initDB = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS receipts (
                id SERIAL PRIMARY KEY,
                receipt_number TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                total_weight NUMERIC NOT NULL,
                total_sum NUMERIC NOT NULL
            );

            CREATE TABLE IF NOT EXISTS receipt_items (
                id SERIAL PRIMARY KEY,
                receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
                percentage INTEGER NOT NULL,
                weight NUMERIC NOT NULL,
                coefficient NUMERIC NOT NULL,
                sum NUMERIC NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        // Базовий коефіцієнт за замовчуванням
        await client.query(`
            INSERT INTO settings (key, value) VALUES ('coefficient', '2.3')
            ON CONFLICT (key) DO NOTHING
        `);

        console.log("✅ База даних ініціалізована");
    } finally {
        client.release();
    }
};

// ====== ТЕСТ ======
app.get("/api/test", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Сервер працює нормально',
            uptime: process.uptime(),
            database: 'підключено (PostgreSQL)',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Помилка БД', error: error.message });
    }
});

// ====== НАЛАШТУВАННЯ ======
app.get("/api/settings/coefficient", async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'coefficient'");
        res.json({ coefficient: parseFloat(result.rows[0]?.value) || 2.3 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/settings/coefficient", async (req, res) => {
    const { coefficient } = req.body;
    const coeffNum = Number(coefficient);
    if (!Number.isFinite(coeffNum) || coeffNum <= 0) {
        return res.status(400).json({ error: "Коефіцієнт має бути більше 0" });
    }
    try {
        await pool.query(
            "INSERT INTO settings (key, value) VALUES ('coefficient', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
            [coeffNum.toString()]
        );
        res.json({ success: true, coefficient: coeffNum });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====== ЧЕКИ ======
app.get("/api/receipts", async (req, res) => {
    try {
        const receipts = await pool.query("SELECT * FROM receipts ORDER BY created_at DESC");
        const result = [];
        for (const receipt of receipts.rows) {
            const items = await pool.query(
                "SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY percentage ASC",
                [receipt.id]
            );
            result.push(normalizeReceipt({ ...receipt, items: items.rows }));
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/receipts/daily/:date", async (req, res) => {
    const { date } = req.params;
    try {
        const receipts = await pool.query(
            "SELECT * FROM receipts WHERE (created_at AT TIME ZONE $2)::date = $1::date ORDER BY created_at ASC",
            [date, REPORT_TIMEZONE]
        );
        const result = [];
        for (const receipt of receipts.rows) {
            const items = await pool.query(
                "SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY percentage ASC",
                [receipt.id]
            );
            result.push(normalizeReceipt({ ...receipt, items: items.rows }));
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Валідація позицій чека
function validateItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "Немає позицій";
    }
    for (const item of items) {
        const percentage = Number(item.percentage);
        const weight = Number(item.weight);
        const coefficient = Number(item.coefficient);

        if (!Number.isFinite(percentage) || percentage < 14 || percentage > 100) {
            return `Некоректний відсоток: ${item.percentage}`;
        }
        if (!Number.isFinite(weight) || weight <= 0) {
            return `Некоректна вага: ${item.weight}`;
        }
        if (!Number.isFinite(coefficient) || coefficient <= 0) {
            return `Некоректний коефіцієнт: ${item.coefficient}`;
        }
    }
    return null;
}

app.post("/api/receipts", async (req, res) => {
    const { receipt_number, items } = req.body;

    const validationError = validateItems(items);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    // Сума ЗАВЖДИ рахується на сервері, клієнтське значення ігнорується
    const computedItems = items.map(i => {
        const percentage = Number(i.percentage);
        const weight = Number(i.weight);
        const coefficient = Number(i.coefficient);
        return {
            percentage,
            weight,
            coefficient,
            sum: Math.floor(percentage * weight * coefficient)
        };
    });

    const total_weight = computedItems.reduce((s, i) => s + i.weight, 0);
    const total_sum = computedItems.reduce((s, i) => s + i.sum, 0);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const receiptRes = await client.query(
            "INSERT INTO receipts (receipt_number, total_weight, total_sum) VALUES ($1, $2, $3) RETURNING id",
            [receipt_number || null, total_weight, total_sum]
        );
        const receiptId = receiptRes.rows[0].id;

        for (const item of computedItems) {
            await client.query(
                "INSERT INTO receipt_items (receipt_id, percentage, weight, coefficient, sum) VALUES ($1, $2, $3, $4, $5)",
                [receiptId, item.percentage, item.weight, item.coefficient, item.sum]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, receiptId, message: "Чек успішно збережено" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка збереження чека:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.delete("/api/receipts/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM receipts WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Чек не знайдено" });
        }
        res.json({ success: true, message: "Чек видалено" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ====== ЗВІТИ ======
app.get("/api/reports/daily/:date", async (req, res) => {
    const { date } = req.params;
    try {
        const receipts = await pool.query(
            "SELECT * FROM receipts WHERE (created_at AT TIME ZONE $2)::date = $1::date ORDER BY created_at ASC",
            [date, REPORT_TIMEZONE]
        );
        const result = [];
        for (const receipt of receipts.rows) {
            const items = await pool.query(
                "SELECT * FROM receipt_items WHERE receipt_id = $1 ORDER BY percentage ASC",
                [receipt.id]
            );
            result.push(normalizeReceipt({ ...receipt, items: items.rows }));
        }

        const totalWeight = result.reduce((sum, r) => sum + r.total_weight, 0);
        const totalSum = result.reduce((sum, r) => sum + r.total_sum, 0);

        res.json({
            date,
            receipts: result,
            totalWeight,
            totalSum,
            count: result.length
        });
    } catch (err) {
        console.error('❌ Помилка звіту:', err);
        res.status(500).json({ error: err.message });
    }
});

// ====== React SPA ======
const clientBuildPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientBuildPath));
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
});

// ====== Запуск ======
const PORT = process.env.PORT || 3001;

initDB()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Сервер запущено на порті ${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ Помилка ініціалізації БД:", err);
        process.exit(1);
    });