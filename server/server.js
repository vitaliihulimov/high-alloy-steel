const express = require("express");
const cors = require("cors");
const db = require("./db");
const path = require("path");

const app = express();

// CORS налаштування для продакшну
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173', // для Vite
    process.env.FRONTEND_URL,
].filter(Boolean); // видаляє undefined

app.use(cors({
    origin: function (origin, callback) {
        // Дозволяємо запити без origin (наприклад, з мобільних додатків)
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

// ========== ТЕСТОВИЙ ЕНДПОІНТ ==========
app.get("/api/test", (req, res) => {
    try {
        // Перевіряємо підключення до бази даних
        const dbTest = db.prepare("SELECT 1").get();

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Сервер працює нормально',
            uptime: process.uptime(),
            database: 'підключено',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Помилка підключення до бази даних',
            error: error.message
        });
    }
});

// ========== НАЛАШТУВАННЯ ==========

// Отримати базовий коефіцієнт
app.get("/api/settings/coefficient", (req, res) => {
    try {
        const result = db.prepare("SELECT value FROM settings WHERE key = 'coefficient'").get();
        res.json({ coefficient: parseFloat(result.value) || 2.3 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Оновити базовий коефіцієнт
app.put("/api/settings/coefficient", (req, res) => {
    const { coefficient } = req.body;
    if (!coefficient || coefficient <= 0) {
        return res.status(400).json({ error: "Коефіцієнт має бути більше 0" });
    }
    try {
        db.prepare("UPDATE settings SET value = ? WHERE key = 'coefficient'").run(coefficient.toString());
        res.json({ success: true, coefficient });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ЧЕКИ/НАКЛАДНІ ==========

// Отримати всі чеки
app.get("/api/receipts", (req, res) => {
    try {
        const receipts = db.prepare(`
            SELECT * FROM receipts 
            ORDER BY created_at DESC
        `).all();

        // Додаємо позиції до кожного чека
        for (const receipt of receipts) {
            const items = db.prepare(`
                SELECT * FROM receipt_items 
                WHERE receipt_id = ?
                ORDER BY percentage ASC
            `).all(receipt.id);
            receipt.items = items;
        }

        res.json(receipts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Отримати чеки за дату
app.get("/api/receipts/daily/:date", (req, res) => {
    const { date } = req.params;
    try {
        const receipts = db.prepare(`
            SELECT * FROM receipts 
            WHERE date(created_at) = date(?)
            ORDER BY created_at ASC
        `).all(date);

        // Додаємо позиції
        for (const receipt of receipts) {
            const items = db.prepare(`
                SELECT * FROM receipt_items 
                WHERE receipt_id = ?
                ORDER BY percentage ASC
            `).all(receipt.id);
            receipt.items = items;
        }

        res.json(receipts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Створити новий чек
app.post("/api/receipts", (req, res) => {
    const { receipt_number, items } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Немає позицій" });
    }

    const total_weight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    const total_sum = items.reduce((sum, item) => sum + (item.sum || 0), 0);

    const transaction = db.transaction(() => {
        // Створюємо чек
        const receiptStmt = db.prepare(`
            INSERT INTO receipts (receipt_number, total_weight, total_sum)
            VALUES (?, ?, ?)
        `);

        const receiptResult = receiptStmt.run(
            receipt_number || null,
            total_weight,
            total_sum
        );

        const receiptId = receiptResult.lastInsertRowid;

        // Додаємо позиції
        const itemStmt = db.prepare(`
            INSERT INTO receipt_items (receipt_id, percentage, weight, coefficient, sum)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of items) {
            itemStmt.run(
                receiptId,
                item.percentage,
                item.weight,
                item.coefficient,
                item.sum
            );
        }

        return receiptId;
    });

    try {
        const receiptId = transaction();
        res.json({
            success: true,
            receiptId,
            message: "Чек успішно збережено"
        });
    } catch (err) {
        console.error('❌ Помилка збереження чека:', err);
        res.status(500).json({ error: err.message });
    }
});

// Видалити чек
app.delete("/api/receipts/:id", (req, res) => {
    const { id } = req.params;
    try {
        const result = db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Чек не знайдено" });
        }
        res.json({ success: true, message: "Чек видалено" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========== ЗВІТИ ==========

// Звіт за день
app.get("/api/reports/daily/:date", (req, res) => {
    const { date } = req.params;
    try {
        const receipts = db.prepare(`
            SELECT * FROM receipts 
            WHERE date(created_at) = date(?)
            ORDER BY created_at ASC
        `).all(date);

        // Додаємо позиції до кожного чека
        for (const receipt of receipts) {
            const items = db.prepare(`
                SELECT * FROM receipt_items 
                WHERE receipt_id = ?
                ORDER BY percentage ASC
            `).all(receipt.id);
            receipt.items = items;
        }

        // Розраховуємо статистику
        const totalWeight = receipts.reduce((sum, r) => sum + (r.total_weight || 0), 0);
        const totalSum = receipts.reduce((sum, r) => sum + (r.total_sum || 0), 0);

        res.json({
            date,
            receipts,
            totalWeight,
            totalSum,
            count: receipts.length
        });
    } catch (err) {
        console.error('❌ Помилка звіту:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущено на порті ${PORT}`);
    console.log(`📡 Тестовий ендпоінт: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/test`);
    console.log(`📊 API доступне: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api`);
    console.log(`🌍 CORS дозволено для:`, allowedOrigins);
});