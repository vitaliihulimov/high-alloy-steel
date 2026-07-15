import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Генеруємо масив відсотків від 14 до 100
const PERCENTAGES = Array.from({ length: 87 }, (_, i) => i + 14);

// Екранування HTML для безпечної вставки користувацьких даних у print-вікна
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

function App() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [baseCoefficient, setBaseCoefficient] = useState(2.3);
  const [serverStatus, setServerStatus] = useState(null); // Стан для статусу сервера
  const [testingServer, setTestingServer] = useState(false); // Стан тестування

  // Стан для нової накладної
  const [receiptNumber, setReceiptNumber] = useState('');
  const [weights, setWeights] = useState({});
  const [tempCoefficients, setTempCoefficients] = useState({}); // Тимчасові коефіцієнти для кожного відсотка

  // Стан для звіту
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyReport, setDailyReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Стан для перегляду чека
  const [viewingReceipt, setViewingReceipt] = useState(null);

  // Стан для адмін-панелі
  const [showAdmin, setShowAdmin] = useState(false);
  const [tempBaseCoefficient, setTempBaseCoefficient] = useState(baseCoefficient);

  // Стан для збереження чека (запобігання подвійному кліку)
  const [saving, setSaving] = useState(false);

  // Завантаження початкових даних
  useEffect(() => {
    loadInitialData();
  }, []);

  // Функція для тестування підключення до сервера
  const testServerConnection = async () => {
    setTestingServer(true);
    setServerStatus(null);

    try {
      const res = await fetch(`${API_URL}/test`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        setServerStatus({
          type: 'success',
          message: `✅ Сервер працює`
        });
      } else {
        setServerStatus({
          type: 'error',
          message: `❌ Сервер відповів з помилкою: ${res.status}`
        });
      }
    } catch (error) {
      setServerStatus({
        type: 'error',
        message: `❌ Не вдалося підключитися до сервера`
      });
    } finally {
      setTestingServer(false);
    }
  };

  const loadInitialData = async () => {
    try {
      // Спочатку тестуємо підключення
      await testServerConnection();

      // Завантажуємо базовий коефіцієнт
      const coeffRes = await fetch(`${API_URL}/settings/coefficient`);
      if (coeffRes.ok) {
        const coeffData = await coeffRes.json();
        setBaseCoefficient(coeffData.coefficient);
        setTempBaseCoefficient(coeffData.coefficient);
      }

      // Завантажуємо чеки
      await loadReceipts();
    } catch (error) {
      console.error('Помилка завантаження:', error);
      setServerStatus({
        type: 'error',
        message: `❌ Помилка завантаження даних`
      });
    } finally {
      setLoading(false);
    }
  };

  const loadReceipts = async () => {
    try {
      const res = await fetch(`${API_URL}/receipts`);
      if (res.ok) {
        const data = await res.json();
        setReceipts(data);
      }
    } catch (error) {
      console.error('Помилка завантаження чеків:', error);
    }
  };

  const updateWeight = (percentage, value) => {
    // Замінюємо кому на крапку
    const normalizedValue = value.replace(',', '.');

    // Дозволяємо тільки цифри та крапку
    const cleanedValue = normalizedValue.replace(/[^\d.]/g, '');

    // Запобігаємо двом крапкам
    const parts = cleanedValue.split('.');
    const finalValue = parts.length > 2
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleanedValue;

    setWeights(prev => ({
      ...prev,
      [percentage]: finalValue === '' ? '' : finalValue
    }));
  };


  // Оновлення тимчасового коефіцієнта для конкретного відсотка
  const updateTempCoefficient = (percentage, value) => {
    const coeff = parseFloat(value) || 0;
    setTempCoefficients(prev => ({
      ...prev,
      [percentage]: coeff > 0 ? coeff : 0
    }));
  };

  // Отримати коефіцієнт для відсотка (тимчасовий або базовий)
  const getCoefficient = (percentage) => {
    const c = tempCoefficients[percentage];
    return c !== undefined ? c : baseCoefficient;
  };

  // Розрахунок суми для конкретного відсотка
  const calculateSum = (percentage) => {
    const weight = weights[percentage] || 0;
    if (!weight || weight <= 0) return 0;

    const coeff = getCoefficient(percentage);
    const sum = percentage * weight * coeff;

    return Math.floor(sum);
  };

  // Загальна вага
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0);

  // Загальна сума
  const totalSum = PERCENTAGES.reduce((sum, p) => sum + calculateSum(p), 0);

  // Скинути тимчасові коефіцієнти
  const resetTempCoefficients = () => {
    setTempCoefficients({});
  };

  // Зберегти чек
  const saveReceipt = async () => {
    if (saving) return; // запобігання подвійному кліку

    // Перевіряємо чи є хоч одна вага
    const hasAnyWeight = Object.values(weights).some(w => parseFloat(w) > 0);

    if (!hasAnyWeight) {
      alert('Введіть вагу хоча б для одного відсотка');
      return;
    }

    // Формуємо позиції
    const items = PERCENTAGES
      .filter(p => parseFloat(weights[p]) > 0)
      .map(p => ({
        percentage: p,
        weight: parseFloat(weights[p]),
        coefficient: getCoefficient(p),
        sum: calculateSum(p)
      }));

    const receiptData = {
      receipt_number: receiptNumber || null,
      items: items
    };

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receiptData)
      });

      if (res.ok) {
        alert('✅ Чек успішно збережено!');
        // Очищаємо форму
        setReceiptNumber('');
        setWeights({});
        resetTempCoefficients();
        // Оновлюємо список чеків
        await loadReceipts();
      } else {
        const error = await res.json();
        alert(`❌ Помилка: ${error.error}`);
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      alert('❌ Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  // Видалити чек
  const deleteReceipt = async (id) => {
    if (!window.confirm('Видалити чек?')) return;

    try {
      const res = await fetch(`${API_URL}/receipts/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        alert('✅ Чек видалено');
        await loadReceipts();
        if (viewingReceipt && viewingReceipt.id === id) {
          setViewingReceipt(null);
        }
        if (dailyReport) {
          generateDailyReport();
        }
      } else {
        const error = await res.json().catch(() => ({}));
        alert(`❌ Помилка видалення: ${error.error || res.status}`);
      }
    } catch (error) {
      console.error('Помилка видалення:', error);
      alert('❌ Не вдалося видалити чек');
    }
  };

  // Згенерувати звіт за день
  const generateDailyReport = async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`${API_URL}/reports/daily/${reportDate}`);
      if (res.ok) {
        const data = await res.json();
        setDailyReport(data);

        // Генеруємо PDF звіт
        generateReportPDF(data);
      } else {
        const error = await res.json();
        alert(`❌ Помилка: ${error.error}`);
      }
    } catch (error) {
      console.error('Помилка звіту:', error);
      alert('❌ Не вдалося згенерувати звіт');
    } finally {
      setLoadingReport(false);
    }
  };

  // Функція для генерації PDF звіту
  const generateReportPDF = (reportData) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Дозвольте спливаючі вікна для друку звіту");
      return;
    }

    const reportDateObj = new Date(reportData.date);
    const reportDateStr = reportDateObj.toLocaleDateString('uk-UA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Групуємо позиції по відсотках ТА коефіцієнту
    const stats = {};

    reportData.receipts.forEach(receipt => {
      receipt.items.forEach(item => {
        const key = `${item.percentage}_${item.coefficient}`;

        if (!stats[key]) {
          stats[key] = {
            percentage: item.percentage,
            coefficient: item.coefficient,
            totalWeight: 0,
            totalSum: 0,
            transactions: []
          };
        }

        stats[key].totalWeight += Number(item.weight);
        stats[key].totalSum += Number(item.sum);
        stats[key].transactions.push({
          weight: item.weight,
          sum: item.sum
        });
      });
    });

    // Сортуємо за відсотком, потім за коефіцієнтом
    const sortedStats = Object.values(stats).sort((a, b) => {
      if (a.percentage !== b.percentage) {
        return a.percentage - b.percentage;
      }
      return a.coefficient - b.coefficient;
    });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Звіт за ${escapeHtml(reportDateStr)}</title>
        <style>
            @page {
                size: A4;
                margin: 20mm;
            }
            
            body {
                font-family: 'Times New Roman', Times, serif;
                font-size: 12pt;
                line-height: 1.4;
                color: #000;
                margin: 0;
                padding: 0;
            }
            
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #000;
                padding-bottom: 15px;
            }
            
            .header h1 {
                font-size: 24pt;
                font-weight: bold;
                margin: 0 0 10px 0;
                text-transform: uppercase;
            }
            
            .header h2 {
                font-size: 18pt;
                font-weight: normal;
                margin: 5px 0;
            }
            
            .summary {
                margin-bottom: 30px;
                padding: 20px;
                background-color: #f5f5f5;
                border: 1px solid #000;
            }
            
            .summary-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 15px;
            }
            
            .summary-item {
                font-size: 12pt;
            }
            
            .summary-item strong {
                font-size: 14pt;
                display: block;
                margin-bottom: 5px;
                color: #000;
            }
            
            .summary-value {
                font-size: 18pt;
                font-weight: bold;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                font-size: 11pt;
            }
            
            th {
                background-color: #000;
                color: white;
                font-weight: bold;
                padding: 10px 5px;
                text-align: center;
                border: 1px solid #000;
                font-size: 11pt;
                text-transform: uppercase;
            }
            
            td {
                border: 1px solid #000;
                padding: 8px 5px;
            }
            
            tr.data-row {
                background-color: #ffffff;
            }
            
            tr.data-row:nth-child(even) {
                background-color: #f5f5f5;
            }
            
            tr.total-row {
                font-weight: bold;
                background-color: #e0e0e0;
            }
            
            tr.total-row td {
                border-top: 2px solid #000;
                font-size: 12pt;
            }
            
            .text-right {
                text-align: right;
            }
            
            .text-center {
                text-align: center;
            }
            
            .number-cell {
                text-align: right;
                font-family: 'Courier New', monospace;
            }
            
            .signature {
                margin-top: 50px;
                padding-top: 20px;
                border-top: 1px solid #000;
                display: flex;
                justify-content: space-between;
            }
            
            .signature-line {
                width: 200px;
                border-bottom: 1px solid #000;
                margin-top: 5px;
            }
            
            .footer {
                margin-top: 30px;
                font-size: 10pt;
                color: #666;
                text-align: center;
                font-style: italic;
            }
            
            @media print {
                .no-print {
                    display: none;
                }
                
                body {
                    padding: 0;
                }
                
                .summary {
                    background-color: #f5f5f5;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                th {
                    background-color: #000 !important;
                    color: white !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            }
        </style>
    </head>
    <body>
        <div class="no-print" style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 5px;">
            <button onclick="window.print()" style="padding: 10px 25px; font-size: 14px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 4px; margin-right: 10px;">
                🖨️ Друкувати звіт
            </button>
            <button onclick="window.close()" style="padding: 10px 25px; font-size: 14px; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 4px;">
                ✕ Закрити
            </button>
        </div>
        
        <div class="header">
            <h1>ЗВІТ ЗА ДЕНЬ</h1>
            <h2>${escapeHtml(reportDateStr)}</h2>
        </div>
        
        <div class="summary">
            <div class="summary-grid">
                <div class="summary-item">
                    <strong>Дата звіту:</strong>
                    <div>${escapeHtml(new Date().toLocaleDateString('uk-UA'))}</div>
                    <div>${escapeHtml(new Date().toLocaleTimeString('uk-UA'))}</div>
                </div>
                <div class="summary-item">
                    <strong>Кількість чеків:</strong>
                    <div class="summary-value">${reportData.receipts.length}</div>
                </div>
                <div class="summary-item">
                    <strong>Загальна вага:</strong>
                    <div class="summary-value">${Number(reportData.totalWeight).toFixed(2)} кг</div>
                </div>
                <div class="summary-item">
                    <strong>Загальна сума:</strong>
                    <div class="summary-value">${Number(reportData.totalSum).toLocaleString('uk-UA')} грн</div>
                </div>
            </div>
        </div>

        ${sortedStats.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th width="5%">№</th>
                        <th width="10%">% сталі</th>
                        <th width="10%">Коеф.</th>
                        <th width="15%">Вага (кг)</th>
                        <th width="15%">Сума (грн)</th>
                        <th width="10%">К-сть</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedStats.map((stat, index) => `
                        <tr class="data-row">
                            <td class="text-center">${index + 1}</td>
                            <td class="text-center"><strong>${stat.percentage}%</strong></td>
                            <td class="text-center">${stat.coefficient}</td>
                            <td class="number-cell">${stat.totalWeight.toFixed(2)}</td>
                            <td class="number-cell"><strong>${stat.totalSum.toLocaleString('uk-UA')}</strong></td>
                            <td class="text-center">${stat.transactions.length}</td>
                        </tr>
                    `).join('')}
                    
                    <tr class="total-row">
                        <td colspan="2" class="text-right"><strong>РАЗОМ:</strong></td>
                        <td class="text-center"><strong>-</strong></td>
                        <td class="number-cell"><strong>${sortedStats.reduce((sum, s) => sum + s.totalWeight, 0).toFixed(2)}</strong></td>
                        <td class="number-cell"><strong>${sortedStats.reduce((sum, s) => sum + s.totalSum, 0).toLocaleString('uk-UA')}</strong></td>
                        <td class="text-center"><strong>${sortedStats.reduce((sum, s) => sum + s.transactions.length, 0)}</strong></td>
                    </tr>
                </tbody>
            </table>
        ` : `
            <div style="text-align: center; padding: 50px; border: 1px solid #000; margin: 20px 0;">
                <p style="font-size: 16pt;">За обраний день немає чеків</p>
            </div>
        `}

        <div class="signature">
            <div>
                <div>Підпис відповідальної особи:</div>
                <div class="signature-line"></div>
            </div>
            <div>
                <div>М.П.</div>
            </div>
            <div>
                <div>Дата:</div>
                <div class="signature-line"></div>
            </div>
        </div>
        
        <div class="footer">
            Звіт згенеровано автоматично системою обліку високолегованої сталі
        </div>
        
        <script>
            window.onload = function() {
                setTimeout(() => {
                    window.print();
                }, 500);
            };
        </script>
    </body>
    </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Зберегти базовий коефіцієнт
  const saveBaseCoefficient = async () => {
    try {
      const res = await fetch(`${API_URL}/settings/coefficient`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coefficient: tempBaseCoefficient })
      });

      if (res.ok) {
        setBaseCoefficient(tempBaseCoefficient);
        setShowAdmin(false);
        alert('✅ Базовий коефіцієнт оновлено');
      } else {
        const error = await res.json().catch(() => ({}));
        alert(`❌ Помилка: ${error.error || res.status}`);
      }
    } catch (error) {
      console.error('Помилка збереження коефіцієнта:', error);
      alert('❌ Не вдалося зберегти коефіцієнт');
    }
  };

  // Переглянути чек
  const viewReceipt = (receipt) => {
    setViewingReceipt(receipt);
  };

  // Закрити перегляд чека
  const closeViewReceipt = () => {
    setViewingReceipt(null);
  };

  // Друк чеку
  const printReceipt = (receipt) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Дозвольте спливаючі вікна для друку чека");
      return;
    }

    const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Чек №${receipt.id}</title>
            <style>
                @page { size: 80mm auto; margin: 2mm; }
                body { 
                    font-family: 'Courier New', monospace; 
                    font-size: 11px;
                    margin: 5px;
                    width: 76mm;
                }
                .header { text-align: center; margin-bottom: 10px; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .item { margin: 3px 0; }
                .total { font-weight: bold; margin-top: 10px; }
                .footer { text-align: center; margin-top: 15px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 2px; text-align: right; }
                td:first-child { text-align: left; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>НАКЛАДНА №${receipt.id}${receipt.receipt_number ? ` (№${escapeHtml(receipt.receipt_number)})` : ''}</h2>
                <div>${escapeHtml(new Date(receipt.created_at).toLocaleString('uk-UA'))}</div>
            </div>
            <div class="line"></div>
            <table>
                <tr>
                    <th>% сталі</th>
                    <th>Коеф.</th>
                    <th>Вага</th>
                    <th>Сума</th>
                </tr>
                ${receipt.items.map(item => `
                <tr>
                    <td>${item.percentage}%</td>
                    <td>${item.coefficient}</td>
                    <td>${Number(item.weight).toFixed(2)} кг</td>
                    <td>${formatNumber(item.sum)} грн</td>
                </tr>
                `).join('')}
            </table>
            <div class="line"></div>
            <div class="total">
                Загальна вага: ${Number(receipt.total_weight).toFixed(2)} кг<br>
                Всього: ${formatNumber(receipt.total_sum)} грн
            </div>
            <div class="footer">
                Дякуємо за співпрацю!
            </div>
            <script>
                window.onload = () => setTimeout(() => window.print(), 200);
            </script>
        </body>
        </html>
        `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: 'white',
        fontSize: '1.5rem'
      }}>
        Завантаження...
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Заголовок */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '20px',
        background: 'linear-gradient(135deg, #333 0%, #242424 100%)',
        borderRadius: '12px',
        border: '1px solid #404040'
      }}>
        <h1 style={{
          color: '#ffc107',
          margin: 0,
          fontSize: '1.8rem'
        }}>
          ⚙️ Високолегована сталь 14-100%
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ color: '#aaa' }}>
            Базовий коефіцієнт: <strong style={{ color: '#28a745', fontSize: '1.3rem' }}>{baseCoefficient}</strong>
          </span>
          <button
            onClick={() => setShowAdmin(true)}
            style={{
              padding: '10px 20px',
              background: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            ⚙️ Змінити базовий коефіцієнт
          </button>
        </div>
      </div>

      {/* Індикатор статусу сервера та кнопка тестування */}
      <div style={{
        marginBottom: '20px',
        padding: '15px 20px',
        background: '#2d2d2d',
        borderRadius: '12px',
        border: '1px solid #404040',
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        <button
          onClick={testServerConnection}
          disabled={testingServer}
          style={{
            padding: '10px 20px',
            background: testingServer ? '#6c757d' : '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: testingServer ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {testingServer ? '⏳ Тестування...' : '🔄 Тестувати сервер'}
        </button>

        {serverStatus && (
          <div style={{
            flex: 1,
            padding: '10px 15px',
            borderRadius: '6px',
            background: serverStatus.type === 'success' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
            border: `1px solid ${serverStatus.type === 'success' ? '#28a745' : '#dc3545'}`,
            color: serverStatus.type === 'success' ? '#28a745' : '#dc3545',
            fontWeight: 'bold'
          }}>
            {serverStatus.message}
          </div>
        )}
      </div>

      {/* Звіт за день */}
      <div style={{
        background: '#2d2d2d',
        padding: '25px',
        borderRadius: '12px',
        marginBottom: '30px',
        border: '1px solid #404040'
      }}>
        <h2 style={{
          color: '#ffc107',
          marginBottom: '20px',
          fontSize: '1.3rem'
        }}>
          📊 Звіт за день
        </h2>

        <div style={{
          display: 'flex',
          gap: '15px',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            style={{
              padding: '12px',
              background: '#333',
              border: '1px solid #404040',
              borderRadius: '6px',
              color: 'white'
            }}
          />
          <button
            onClick={generateDailyReport}
            disabled={loadingReport}
            style={{
              padding: '12px 25px',
              background: loadingReport ? '#6c757d' : '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loadingReport ? 'not-allowed' : 'pointer'
            }}
          >
            {loadingReport ? '⏳ Завантаження...' : '📄 Сформувати звіт'}
          </button>
        </div>
      </div>

      {/* Форма нової накладної */}
      <div style={{
        background: '#2d2d2d',
        padding: '25px',
        borderRadius: '12px',
        marginBottom: '30px',
        border: '1px solid #404040'
      }}>
        <h2 style={{
          color: '#ffc107',
          marginBottom: '20px',
          fontSize: '1.3rem'
        }}>
          📝 Нова накладна
        </h2>

        <div style={{
          marginBottom: '20px'
        }}>
          <label style={{ color: '#aaa', display: 'block', marginBottom: '5px' }}>
            № накладної (необов'язково)
          </label>
          <input
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="Наприклад: 001"
            style={{
              width: '300px',
              padding: '12px',
              background: '#333',
              border: '1px solid #404040',
              borderRadius: '6px',
              color: 'white'
            }}
          />
        </div>

        {/* Таблиця з відсотками */}
        <div style={{
          overflowX: 'auto',
          marginBottom: '20px',
          borderRadius: '8px',
          border: '1px solid #404040'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '1400px'
          }}>
            <thead style={{ background: '#333' }}>
              <tr>
                <th style={{ padding: '15px', textAlign: 'left', color: '#ffc107' }}>
                  Відсоток сталі
                </th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#ffc107' }}>
                  Вага (кг)
                </th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#ffc107' }}>
                  Коефіцієнт
                </th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#ffc107' }}>
                  Розрахунок
                </th>
                <th style={{ padding: '15px', textAlign: 'left', color: '#ffc107' }}>
                  Сума (грн)
                </th>
              </tr>
            </thead>
            <tbody>
              {PERCENTAGES.map(percentage => {
                const weight = weights[percentage] || '';
                const coeff = getCoefficient(percentage);
                const sum = calculateSum(percentage);
                const isCustomCoeff = tempCoefficients[percentage] !== undefined;

                return (
                  <tr key={percentage} style={{
                    borderTop: '1px solid #404040',
                    backgroundColor: isCustomCoeff ? '#2a2a2a' : 'transparent'
                  }}>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>
                      {percentage}%
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={weight}
                        onChange={(e) => updateWeight(percentage, e.target.value)}
                        onKeyDown={(e) => {
                          // Дозволяємо тільки цифри, кому, крапку, backspace, delete, tab, enter
                          const allowedKeys = [
                            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                            '.', ',', 'Backspace', 'Delete', 'Tab', 'Enter',
                            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                            'Home', 'End'
                          ];

                          if (!allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                          }

                          // Запобігаємо двом роздільникам
                          if ((e.key === '.' || e.key === ',') &&
                            (e.target.value.includes('.') || e.target.value.includes(','))) {
                            e.preventDefault();
                          }
                        }}
                        placeholder="0.00"
                        style={{
                          width: '120px',
                          padding: '8px',
                          background: '#333',
                          border: '1px solid #404040',
                          borderRadius: '4px',
                          color: 'white'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={coeff}
                        onChange={(e) => updateTempCoefficient(percentage, e.target.value)}
                        style={{
                          width: '100px',
                          padding: '8px',
                          background: isCustomCoeff ? '#3a3a3a' : '#333',
                          border: `2px solid ${isCustomCoeff ? '#ffc107' : '#28a745'}`,
                          borderRadius: '4px',
                          color: 'white',
                          fontWeight: isCustomCoeff ? 'bold' : 'normal'
                        }}
                      />
                      {isCustomCoeff && (
                        <span style={{ color: '#ffc107', marginLeft: '5px', fontSize: '0.8rem' }}>
                          ✏️ змінено
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', color: '#aaa' }}>
                      {weight > 0 ? `${percentage} × ${weight} × ${coeff}` : '—'}
                    </td>
                    <td style={{
                      padding: '12px',
                      color: sum > 0 ? '#28a745' : '#aaa',
                      fontWeight: sum > 0 ? 'bold' : 'normal',
                      fontSize: sum > 0 ? '1.1rem' : '0.9rem'
                    }}>
                      {sum > 0 ? `${sum.toLocaleString('uk-UA')} грн` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Підсумок */}
        <div style={{
          padding: '20px',
          background: '#242424',
          border: '1px solid #404040',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ color: '#aaa' }}>Загальна вага: </span>
            <strong style={{ color: '#ffc107', fontSize: '1.3rem' }}>
              {totalWeight.toFixed(2)} кг
            </strong>
          </div>
          <div>
            <span style={{ color: '#aaa' }}>Загальна сума: </span>
            <strong style={{ color: '#28a745', fontSize: '1.8rem' }}>
              {totalSum.toLocaleString('uk-UA')} грн
            </strong>
          </div>
          <button
            onClick={saveReceipt}
            disabled={saving}
            style={{
              padding: '12px 30px',
              background: saving ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem'
            }}
          >
            {saving ? '⏳ Збереження...' : '💾 Зберегти чек'}
          </button>
        </div>
      </div>

      {/* Список всіх чеків */}
      <div style={{
        background: '#2d2d2d',
        padding: '25px',
        borderRadius: '12px',
        border: '1px solid #404040'
      }}>
        <h2 style={{
          color: '#ffc107',
          marginBottom: '20px',
          fontSize: '1.3rem'
        }}>
          📋 Всі збережені чеки
        </h2>

        {receipts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            background: '#242424',
            borderRadius: '8px',
            color: '#aaa'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📄</div>
            <div>Немає збережених чеків</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gap: '15px',
            maxHeight: '600px',
            overflowY: 'auto',
            paddingRight: '10px'
          }}>
            {receipts.map(receipt => (
              <div key={receipt.id} style={{
                padding: '20px',
                background: '#242424',
                borderRadius: '8px',
                border: '1px solid #404040',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onClick={() => viewReceipt(receipt)}
                onMouseOver={(e) => e.currentTarget.style.background = '#2a2a2a'}
                onMouseOut={(e) => e.currentTarget.style.background = '#242424'}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}>
                  <div>
                    <strong style={{ color: '#ffc107', fontSize: '1.2rem' }}>
                      Чек №{receipt.id}
                    </strong>
                    {receipt.receipt_number && (
                      <span style={{ color: '#aaa', marginLeft: '10px' }}>
                        (№{receipt.receipt_number})
                      </span>
                    )}
                  </div>
                  <span style={{ color: '#28a745', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {receipt.total_sum.toLocaleString('uk-UA')} грн
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '10px',
                  marginBottom: '15px',
                  padding: '10px',
                  background: '#1a1a1a',
                  borderRadius: '6px'
                }}>
                  <div>
                    <span style={{ color: '#aaa' }}>Дата: </span>
                    <span style={{ color: 'white' }}>
                      {new Date(receipt.created_at).toLocaleString('uk-UA')}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#aaa' }}>Вага: </span>
                    <span style={{ color: 'white' }}>{receipt.total_weight.toFixed(2)} кг</span>
                  </div>
                  <div>
                    <span style={{ color: '#aaa' }}>Позицій: </span>
                    <span style={{ color: '#ffc107' }}>{receipt.items?.length || 0}</span>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      viewReceipt(receipt);
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    👁️ Детально
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      printReceipt(receipt);
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    🖨️ Друк
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteReceipt(receipt.id);
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Видалити
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модальне вікно для перегляду чека */}
      {viewingReceipt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: '#2d2d2d',
            borderRadius: '12px',
            width: '800px',
            maxWidth: '95%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            border: '2px solid #404040'
          }}>
            {/* Заголовок */}
            <div style={{
              padding: '20px',
              background: '#333',
              borderBottom: '2px solid #404040',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ color: '#ffc107', margin: 0 }}>
                Чек №{viewingReceipt.id} {viewingReceipt.receipt_number && `(№${viewingReceipt.receipt_number})`}
              </h3>
              <button
                onClick={closeViewReceipt}
                style={{
                  padding: '8px 16px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✕ Закрити
              </button>
            </div>

            {/* Тіло */}
            <div style={{
              padding: '25px',
              overflowY: 'auto',
              maxHeight: 'calc(90vh - 120px)'
            }}>
              <div style={{
                marginBottom: '20px',
                padding: '15px',
                background: '#242424',
                borderRadius: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '15px'
              }}>
                <div>
                  <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Дата</div>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>
                    {new Date(viewingReceipt.created_at).toLocaleString('uk-UA')}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Загальна вага</div>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>
                    {viewingReceipt.total_weight.toFixed(2)} кг
                  </div>
                </div>
                <div>
                  <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Загальна сума</div>
                  <div style={{ color: '#28a745', fontWeight: 'bold' }}>
                    {viewingReceipt.total_sum.toLocaleString('uk-UA')} грн
                  </div>
                </div>
              </div>

              <h4 style={{ color: '#ffc107', marginBottom: '15px' }}>Позиції:</h4>

              <div style={{
                overflowX: 'auto',
                borderRadius: '8px',
                border: '1px solid #404040',
                marginBottom: '20px'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '600px'
                }}>
                  <thead style={{ background: '#333' }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'white' }}>% сталі</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'white' }}>Коефіцієнт</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'white' }}>Вага (кг)</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'white' }}>Розрахунок</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'white' }}>Сума (грн)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingReceipt.items.map((item, index) => (
                      <tr key={index} style={{
                        borderTop: '1px solid #404040'
                      }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: 'white' }}>
                          {item.percentage}%
                        </td>
                        <td style={{ padding: '12px', color: '#28a745' }}>
                          {item.coefficient}
                        </td>
                        <td style={{ padding: '12px', color: 'white' }}>
                          {item.weight.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', color: '#aaa' }}>
                          {item.percentage} × {item.weight.toFixed(2)} × {item.coefficient}
                        </td>
                        <td style={{
                          padding: '12px',
                          color: '#28a745',
                          fontWeight: 'bold'
                        }}>
                          {item.sum.toLocaleString('uk-UA')} грн
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Кнопки дій */}
            <div style={{
              padding: '20px',
              background: '#333',
              borderTop: '2px solid #404040',
              display: 'flex',
              gap: '15px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => printReceipt(viewingReceipt)}
                style={{
                  padding: '12px 25px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                🖨️ Друкувати чек
              </button>
              <button
                onClick={() => {
                  deleteReceipt(viewingReceipt.id);
                  closeViewReceipt();
                }}
                style={{
                  padding: '12px 25px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                🗑️ Видалити чек
              </button>
              <button
                onClick={closeViewReceipt}
                style={{
                  padding: '12px 25px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Адмін-панель */}
      {showAdmin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#2d2d2d',
            padding: '30px',
            borderRadius: '12px',
            width: '400px',
            maxWidth: '90%',
            border: '2px solid #404040'
          }}>
            <h3 style={{
              color: '#ffc107',
              marginBottom: '20px',
              fontSize: '1.3rem'
            }}>
              ⚙️ Зміна базового коефіцієнта
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ color: '#aaa', display: 'block', marginBottom: '5px' }}>
                Базовий коефіцієнт (зараз {baseCoefficient})
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={tempBaseCoefficient}
                onChange={(e) => setTempBaseCoefficient(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#333',
                  border: '2px solid #28a745',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '1.2rem'
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowAdmin(false)}
                style={{
                  padding: '10px 20px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Скасувати
              </button>
              <button
                onClick={saveBaseCoefficient}
                style={{
                  padding: '10px 20px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
