/**
 * Gacha Tabulation (v1.0.2) - Frontend Application Core Logic
 * Blue Archive Gacha Analytics System
 */

const APP_VERSION = 'v1.0.2';

document.addEventListener('DOMContentLoaded', () => {
  // State management
  let gachaData = [];
  let isGasMode = false;
  let rateChart = null;
  let breakdownChart = null;
  let studentIcons = {};
  const avatarImgCache = {};

  // History table filtering and sorting state
  let currentHistoryFilter = 'all';
  let historySearchQuery = '';
  let currentSortKey = 'date';
  let currentSortOrder = 'desc';
  let globalStudentSummaryList = [];

  // Student directory filtering and sorting state
  let currentDirectoryFilter = 'all';
  let directorySearchQuery = '';
  let currentDirectorySort = 'recent';

  // Load Icons first
  loadIcons();

  // Initialize UI & Event Listeners
  initTabs();
  initPasteListener();
  initFilters();
  initTableSorting();
  initIconFetchListener();
  initSpreadsheetSync();
  initSampleGeneratorListener();
  initSearchAndFilterListeners();
  initBackupRestoreListener();

  // Load Initial Data (from LocalStorage or auto-sync Spreadsheet)
  loadLocalData();

  // Tab switching logic
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const activeContent = document.getElementById(tabName);
        if (activeContent) {
          activeContent.classList.add('active');
        }

        // Re-render charts when switching to dashboard to fix canvas sizing issues
        if (tabName === 'dashboard') {
          updateCharts();
        }
      });
    });
  }

  // Clipboard Paste listener
  function initPasteListener() {
    const pasteTarget = document.getElementById('pasteTarget');
    const pasteContainer = document.getElementById('pasteContainer');

    // Drag-over styling
    pasteContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      pasteContainer.classList.add('drag-over');
    });
    pasteContainer.addEventListener('dragleave', () => {
      pasteContainer.classList.remove('drag-over');
    });
    pasteContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      pasteContainer.classList.remove('drag-over');
    });

    pasteTarget.addEventListener('paste', (e) => {
      e.preventDefault();
      
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      
      let parsedRows = [];
      if (html) {
        parsedRows = parsePastedHTML(html);
      } else if (text) {
        parsedRows = parsePastedText(text);
      }

      if (parsedRows && parsedRows.length > 0) {
        processRawRows(parsedRows);
        // Save to local storage
        localStorage.setItem('schale_gacha_data', JSON.stringify(parsedRows));
        
        // Show status
        const statusDiv = document.getElementById('pasteStatus');
        const summaryText = document.getElementById('parsedSummaryText');
        statusDiv.style.display = 'block';
        
        const totalPulls = gachaData.reduce((acc, r) => acc + r.pullsCount, 0);
        const total3Star = gachaData.reduce((acc, r) => acc + r.threeStarCount, 0);
        summaryText.textContent = `${gachaData.length}行のデータを解析しました。総ガチャ回数: ${totalPulls}連、排出された☆3生徒: ${total3Star}名。`;
        
        // Auto-switch to dashboard
        setTimeout(() => {
          document.querySelector('[data-tab="dashboard"]').click();
        }, 800);
      } else {
        alert('データを読み取れませんでした。コピーするセル範囲を確認してください。');
      }
    });
  }

  // Helper to parse Hex and RGB styles to categorize background colors
  function detectColor(colorStr) {
    if (!colorStr) return 'regular';
    colorStr = colorStr.toLowerCase();
    
    // Match common Google Sheets yellow highlights
    if (
      colorStr.includes('yellow') || 
      colorStr.includes('ffd600') || 
      colorStr.includes('ffff00') || 
      colorStr.includes('fff2cc') || 
      colorStr.includes('ffd966') || 
      colorStr.includes('ffe599') || 
      colorStr.includes('fff59d') || 
      colorStr.includes('fff9c4')
    ) {
      return 'pickup';
    }
    // Match common Google Sheets green highlights
    if (
      colorStr.includes('green') || 
      colorStr.includes('00ff00') || 
      colorStr.includes('d9ead3') || 
      colorStr.includes('b6d7a8') || 
      colorStr.includes('93c47d') || 
      colorStr.includes('a1e9c5') || 
      colorStr.includes('c8e6c9') || 
      colorStr.includes('a5d6a7') || 
      colorStr.includes('e8f5e9')
    ) {
      return 'new';
    }
    
    // Parse RGB patterns
    const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      // Yellow: High R & G, Low B
      if (r > 200 && g > 180 && b < 180) {
        return 'pickup';
      }
      // Green: High G, Lower R & B
      if (g > 160 && r < 210 && b < 210 && g > r && g > b) {
        return 'new';
      }
    }
    return 'regular';
  }

  // Parse HTML tables copied from clipboard
  function parsePastedHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const trs = doc.querySelectorAll('tr');
    const parsedRows = [];

    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td, th');
      if (tds.length === 0) return;
      
      const firstCellText = tds[0].textContent.trim();
      // Skip header rows
      if (firstCellText.includes('累計') || firstCellText.includes('合計') || firstCellText.includes('日付')) {
        return;
      }

      const rowValues = [];
      const rowBgs = [];
      
      tds.forEach(td => {
        rowValues.push(td.textContent.trim());
        // Extract background-color from style attribute
        const style = td.getAttribute('style') || '';
        const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
        rowBgs.push(bgMatch ? bgMatch[1].trim() : '');
      });

      if (rowValues.length < 3) return; // Need at least: cumulative, date, pulls

      parsedRows.push({
        values: rowValues,
        backgrounds: rowBgs
      });
    });

    return parsedRows;
  }

  // Parse tab-separated values (TSV) text
  function parsePastedText(text) {
    // If text contains commas and no tabs, delegate to CSV parser
    if (!text.includes('\t') && text.includes(',')) {
      return parseCSVText(text);
    }

    const lines = text.split(/\r?\n/);
    const parsedRows = [];
    
    lines.forEach(line => {
      if (!line.trim()) return;
      const rowValues = line.split('\t');
      if (rowValues.length < 3) return;
      
      // Skip header
      if (rowValues[0].includes('累計') || rowValues[0].includes('日付') || rowValues[2] === '引') return;

      const rowBgs = Array(rowValues.length).fill('');
      parsedRows.push({
        values: rowValues,
        backgrounds: rowBgs
      });
    });
    return parsedRows;
  }

  // Parse RFC 4180 compliant CSV line with quotes support
  function parseCSVLine(line) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur.trim());
    return values;
  }

  // Parse CSV format text
  function parseCSVText(text) {
    const lines = text.split(/\r?\n/);
    const parsedRows = [];
    
    lines.forEach(line => {
      if (!line.trim()) return;
      const rowValues = parseCSVLine(line);
      if (rowValues.length < 3) return;
      
      // Skip empty or header rows
      const col0 = rowValues[0] || '';
      const col2 = rowValues[2] || '';
      if (col0.includes('累計') || col0.includes('日付') || col2 === '引') return;
      // Skip totally blank rows
      if (rowValues.every(v => v === '')) return;

      const rowBgs = Array(rowValues.length).fill('');
      parsedRows.push({
        values: rowValues,
        backgrounds: rowBgs
      });
    });
    return parsedRows;
  }

  // Helper to parse date strings (like yyyy-MM-dd, MM/dd, M/d, M月d日, etc.) to timestamps
  function parseDateToTimestamp(dateStr) {
    if (!dateStr) return 0;
    dateStr = String(dateStr).trim();
    
    // 1. Try yyyy-MM-dd or yyyy/MM/dd
    let match = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
    }
    
    // 2. Try MM-dd or MM/dd or M-d or M/d (default year 2026)
    match = dateStr.match(/^(\d{1,2})[-/](\d{1,2})/);
    if (match) {
      return new Date(2026, parseInt(match[1]) - 1, parseInt(match[2])).getTime();
    }
    
    // 3. Try Japanese formats like 2026年1月28日 or 1月28日
    match = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
    }
    match = dateStr.match(/^(\d{1,2})月(\d{1,2})日/);
    if (match) {
      return new Date(2026, parseInt(match[1]) - 1, parseInt(match[2])).getTime();
    }
    
    // 4. Fallback to standard Date.parse
    const ts = Date.parse(dateStr);
    return isNaN(ts) ? 0 : ts;
  }

  // Process normalized raw rows (value array + background color string array)
  function processRawRows(rawRows) {
    const mapped = rawRows.map((row, index) => {
      // Index mapping based on user description
      const cumulativePulls = parseInt(row.values[0]) || 0;
      const date = row.values[1] ? String(row.values[1]).trim() : '';
      const pullsCount = parseInt(row.values[2]) || 0;
      const threeStarCount = parseInt(row.values[3]) || 0;
      const pickupCount = parseInt(row.values[4]) || 0;
      const newCount = parseInt(row.values[5]) || 0;
      const ownedCount = parseInt(row.values[6]) || 0;
      
      // Student names: Col 8, 9, 10, 11 (Indices 7, 8, 9, 10)
      const studentNames = [];
      const studentBgs = [];
      for (let i = 7; i <= 10; i++) {
        if (row.values[i] && String(row.values[i]).trim() !== '') {
          studentNames.push(String(row.values[i]).trim());
          studentBgs.push(detectColor(row.backgrounds[i]));
        }
      }
      
      // Base probability: Col 12 (Index 11)
      let baseRate = 3.0; // default to 3%
      if (row.values[11]) {
        const rateStr = String(row.values[11]).replace('%', '');
        baseRate = parseFloat(rateStr) || 3.0;
      }

      // Guarantee info: Col 13 (Index 12)
      const guaranteeInfo = row.values[12] ? String(row.values[12]).trim() : '';

      return {
        originalIndex: index,
        cumulativePulls,
        date,
        dateTimestamp: parseDateToTimestamp(date),
        pullsCount,
        threeStarCount,
        pickupCount,
        newCount,
        ownedCount,
        studentNames,
        studentBgs,
        baseRate,
        guaranteeInfo
      };
    });

    if (mapped.length === 0) {
      gachaData = [];
      aggregateAndDisplay();
      return;
    }

    // Detect if the sheet rows are newest-to-oldest (reversed) or oldest-to-newest
    let isReversed = false;
    const rowsWithDates = mapped.filter(r => r.dateTimestamp > 0);
    if (rowsWithDates.length >= 2) {
      const firstWithDate = rowsWithDates[0];
      const lastWithDate = rowsWithDates[rowsWithDates.length - 1];
      if (firstWithDate.dateTimestamp > lastWithDate.dateTimestamp) {
        isReversed = true;
      } else if (firstWithDate.dateTimestamp === lastWithDate.dateTimestamp) {
        const firstWithPulls = mapped.find(r => r.cumulativePulls > 0);
        const lastWithPulls = [...mapped].reverse().find(r => r.cumulativePulls > 0);
        if (firstWithPulls && lastWithPulls && firstWithPulls !== lastWithPulls) {
          if (firstWithPulls.cumulativePulls > lastWithPulls.cumulativePulls) {
            isReversed = true;
          }
        }
      }
    } else {
      const firstWithPulls = mapped.find(r => r.cumulativePulls > 0);
      const lastWithPulls = [...mapped].reverse().find(r => r.cumulativePulls > 0);
      if (firstWithPulls && lastWithPulls && firstWithPulls !== lastWithPulls) {
        if (firstWithPulls.cumulativePulls > lastWithPulls.cumulativePulls) {
          isReversed = true;
        }
      }
    }

    // Sort strictly chronologically (oldest first)
    mapped.sort((a, b) => {
      // 1. Date timestamp
      if (a.dateTimestamp !== b.dateTimestamp) {
        return a.dateTimestamp - b.dateTimestamp;
      }
      // 2. Cumulative pulls
      if (a.cumulativePulls !== b.cumulativePulls) {
        return a.cumulativePulls - b.cumulativePulls;
      }
      // 3. Original array index (if reversed, larger index is older)
      if (isReversed) {
        return b.originalIndex - a.originalIndex;
      } else {
        return a.originalIndex - b.originalIndex;
      }
    });

    gachaData = mapped;

    // Run aggregations and redraw
    aggregateAndDisplay();
  }

  // Native GAS loading
  function loadGasData() {
    document.getElementById('connectionStatus').textContent = 'GASからデータを同期中...';
    
    google.script.run
      .withSuccessHandler((data) => {
        document.getElementById('connectionStatus').textContent = 'GASネイティブ接続中';
        if (data && data.length > 0) {
          processRawRows(data);
        } else {
          alert('スプレッドシートにデータが見つかりませんでした。2行目以降にデータが入っているかご確認ください。');
        }
      })
      .withFailureHandler((err) => {
        document.getElementById('connectionStatus').textContent = 'GAS同期エラー';
        console.error(err);
        alert('データの取得に失敗しました: ' + err.message);
      })
      .getGachaData();
  }

  // Standalone LocalStorage loading
  function loadLocalData() {
    const stored = localStorage.getItem('schale_gacha_data');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        processRawRows(parsed);
      } catch (e) {
        console.error('Local Storage error', e);
      }
    }
  }

  // core statistical aggregator
  function aggregateAndDisplay() {
    let totalPulls = 0;
    let total3Star = 0;
    let totalPickup = 0;
    let totalNew = 0;
    let totalOwned = 0;

    let normalPulls = 0;
    let normal3Star = 0;
    let annivPulls = 0;
    let anniv3Star = 0;

    let guaranteeTriggers = 0;
    let guaranteeWins = 0;
    let guaranteeLosses = 0;

    let maxStreakWithout3Star = 0;
    let currentStreakWithout3Star = 0;

    const studentSummaryList = [];
    const studentDrawCounts = {};

    gachaData.forEach(row => {
      totalPulls += row.pullsCount;
      total3Star += row.threeStarCount;
      totalPickup += row.pickupCount;
      totalNew += row.newCount;
      totalOwned += row.ownedCount;

      // Group pulls and star-3s by banner rate (3% vs 6%)
      if (row.baseRate === 6) {
        annivPulls += row.pullsCount;
        anniv3Star += row.threeStarCount;
      } else if (row.baseRate === 3) {
        normalPulls += row.pullsCount;
        normal3Star += row.threeStarCount;
      }

      // 100-pull guarantee system processing (triggers on explicit info OR if baseRate is 50%)
      if (row.guaranteeInfo !== '' || row.baseRate === 50) {
        guaranteeTriggers++;
        
        let isWin = false;
        let isLoss = false;
        
        if (row.guaranteeInfo !== '') {
          isWin = /○|1|成功|勝|win|pickup/i.test(row.guaranteeInfo);
          isLoss = /×|0|失敗|敗|loss|spook|被り/i.test(row.guaranteeInfo);
        }
        
        if (isWin) {
          guaranteeWins++;
        } else if (isLoss) {
          guaranteeLosses++;
        } else {
          // Fallback if guaranteeInfo is empty: win if pickupCount > 0 or yellow highlight, else loss
          const hasColorPickup = row.studentBgs && row.studentBgs.some(bg => bg === 'pickup');
          if (row.pickupCount > 0 || hasColorPickup) {
            guaranteeWins++;
          } else {
            guaranteeLosses++;
          }
        }
      }

      // Streak without 3-star calculation (Ignore 50% and 100% rates, only target 3% and 6% normal/anniversary banners)
      if (row.baseRate === 3 || row.baseRate === 6) {
        if (row.threeStarCount > 0) {
          if (currentStreakWithout3Star > maxStreakWithout3Star) {
            maxStreakWithout3Star = currentStreakWithout3Star;
          }
          currentStreakWithout3Star = 0; // reset
        } else {
          currentStreakWithout3Star += row.pullsCount;
        }
      }

      // Collect student info
      let remPickup = row.pickupCount || 0;
      let remNew = row.newCount || 0;

      row.studentNames.forEach((name, idx) => {
        let type = row.studentBgs[idx] || 'regular';
        
        // Infer if background color is regular but counts say otherwise (e.g. CSV import)
        if (type === 'regular') {
          if (remPickup > 0) {
            type = 'pickup';
            remPickup--;
          } else if (remNew > 0) {
            type = 'new';
            remNew--;
          }
        }

        // Track running draw count for this student
        studentDrawCounts[name] = (studentDrawCounts[name] || 0) + 1;

        studentSummaryList.push({
          name,
          date: row.date,
          type, // 'pickup' / 'new' / 'regular'
          baseRate: row.baseRate,
          cumulativePulls: row.cumulativePulls,
          drawNumber: studentDrawCounts[name]
        });
      });
    });

    if (currentStreakWithout3Star > maxStreakWithout3Star) {
      maxStreakWithout3Star = currentStreakWithout3Star;
    }

    // Expected value calculation based on variable base rates:
    let expectedThreeStars = 0;
    gachaData.forEach(row => {
      // 100th guaranteed pulls have 100% 3-star rate. 
      // If we know a row has guarantee, we should adjust the probability math.
      // But typically, base rate * pull count covers the regular pulls.
      expectedThreeStars += (row.pullsCount * (row.baseRate / 100));
    });

    // 1. Update Metrics Cards
    document.getElementById('statTotalPulls').innerHTML = `${totalPulls} <span class="unit">連</span>`;
    document.getElementById('statTotalPyroxene').textContent = (totalPulls * 120).toLocaleString();
    
    // Overall Rates
    // 3% Normal Rate
    const normalRateVal = normalPulls > 0 ? (normal3Star / normalPulls) * 100 : 0;
    const normalExpected = normalPulls * 0.03;
    document.getElementById('statNormalRate').textContent = normalRateVal.toFixed(2);
    document.getElementById('subtextThreeStar3').innerHTML = `獲得: <span style="font-weight:600;">${normal3Star}</span> 人 (期待値: ${normalExpected.toFixed(1)}人) / ${normalPulls}連`;

    // 6% Anniversary Rate
    const annivRateVal = annivPulls > 0 ? (anniv3Star / annivPulls) * 100 : 0;
    const annivExpected = annivPulls * 0.06;
    document.getElementById('statAnniversaryRate').textContent = annivRateVal.toFixed(2);
    document.getElementById('subtextThreeStar6').innerHTML = `獲得: <span style="font-weight:600;">${anniv3Star}</span> 人 (期待値: ${annivExpected.toFixed(1)}人) / ${annivPulls}連`;
    
    // Pickup Stats (Target only 3% and 6% gachas)
    let pickupCountForRates = 0;
    gachaData.forEach(row => {
      if (row.baseRate === 3 || row.baseRate === 6) {
        pickupCountForRates += row.pickupCount;
      }
    });
    const targetPickupPulls = normalPulls + annivPulls;
    const pickupRate = targetPickupPulls > 0 ? (pickupCountForRates / targetPickupPulls) * 100 : 0;
    const pickupExpected = targetPickupPulls * 0.007; // expected at 0.7% rate

    document.getElementById('statPickupRate').innerHTML = `${pickupRate.toFixed(2)} <span class="unit">%</span>`;
    document.getElementById('subtextPickup').innerHTML = `獲得: <span style="font-weight:600;">${pickupCountForRates}</span> 人 (期待値: ${pickupExpected.toFixed(1)} 人) / ${targetPickupPulls}連`;

    // 100-pull 50% Guarantee
    const totalGuaranteeWins = guaranteeWins;
    const totalGuaranteeLosses = guaranteeLosses;
    const totalGuaranteeTriggers = guaranteeTriggers;
    const guaranteeWinRate = totalGuaranteeTriggers > 0 ? (totalGuaranteeWins / totalGuaranteeTriggers) * 100 : 0;
    
    document.getElementById('statGuaranteeWinRate').innerHTML = `${guaranteeWinRate.toFixed(1)} <span class="unit">%</span>`;
    document.getElementById('statGuaranteeWins').textContent = totalGuaranteeWins;
    document.getElementById('statGuaranteeLosses').textContent = totalGuaranteeLosses;
    document.getElementById('statGuaranteeTotal').textContent = totalGuaranteeTriggers;



    document.getElementById('statMaxStreak').innerHTML = `${maxStreakWithout3Star} <span style="font-size:12px; color:var(--text-muted);">連</span>`;
    document.getElementById('statCurrentStreak').textContent = currentStreakWithout3Star;

    // Advanced Metrics Calculations
    // 1. Expected Value Difference (Luck Diff)
    const luckDiffEl = document.getElementById('statLuckDiff');
    const luckDiffDetailsEl = document.getElementById('statLuckDiffDetails');
    const rawLuckDiff = total3Star - expectedThreeStars;
    if (rawLuckDiff > 0) {
      luckDiffEl.textContent = `+${rawLuckDiff.toFixed(1)} 人`;
      luckDiffEl.style.color = 'var(--success)';
      luckDiffDetailsEl.textContent = '期待値より多く引けています (上振れ)';
    } else if (rawLuckDiff < 0) {
      luckDiffEl.textContent = `${rawLuckDiff.toFixed(1)} 人`;
      luckDiffEl.style.color = 'var(--secondary)';
      luckDiffDetailsEl.textContent = '期待値より獲得が少ないです (下振れ)';
    } else {
      luckDiffEl.textContent = '±0.0 人';
      luckDiffEl.style.color = 'var(--text-muted)';
      luckDiffDetailsEl.textContent = '期待値通りの確率です';
    }

    // 2. Ceiling Comparison (天井到達と総ガチャ比較)
    let ceilingSparksCount = 0;
    gachaData.forEach(row => {
      if (row.baseRate === 100) {
        ceilingSparksCount++;
      }
    });

    const statCeilingComparisonEl = document.getElementById('statCeilingComparison');
    const statCeilingComparisonDetailsEl = document.getElementById('statCeilingComparisonDetails');

    const totalCeilingPulls = ceilingSparksCount * 200;
    const ceilingRatio = totalPulls > 0 ? (totalCeilingPulls / totalPulls) * 100 : 0;
    const selfDrawnStars = total3Star - ceilingSparksCount;

    statCeilingComparisonEl.innerHTML = `${ceilingSparksCount} <span style="font-size:12px; color:var(--text-muted);">回 (${ceilingRatio.toFixed(1)}%)</span>`;
    statCeilingComparisonDetailsEl.textContent = `天井交換: ${ceilingSparksCount}人 / 自力排出: ${selfDrawnStars}人`;



    // Expected indicator color coding
    const luckDiff = total3Star - expectedThreeStars;
    let luckIcon = '⚖️';
    let luckClass = 'warning';
    let luckLabel = '平均的 (確率通り)';
    
    if (totalPulls > 0) {
      const deviation = expectedThreeStars > 0 ? luckDiff / expectedThreeStars : 0;
      if (deviation >= 0.3) {
        luckIcon = '✨'; luckClass = 'success'; luckLabel = '大勝利級の神引き！';
      } else if (deviation >= 0.1) {
        luckIcon = '📈'; luckClass = 'success'; luckLabel = '勝ち組 (豪運)';
      } else if (deviation <= -0.3) {
        luckIcon = '💀'; luckClass = 'danger'; luckLabel = '大爆死 (超不運)';
      } else if (deviation <= -0.1) {
        luckIcon = '📉'; luckClass = 'danger'; luckLabel = '下振れ (やや不運)';
      }
    }

    document.getElementById('statLuckEvaluation').textContent = `${luckIcon} ${luckLabel}`;
    document.getElementById('statLuckEvaluation').style.color = luckClass === 'success' ? 'var(--success)' : luckClass === 'danger' ? 'var(--secondary)' : 'var(--warning)';

    // 3. Render Table
    renderHistoryTable(gachaData);

    // 4. Render Student Directory
    globalStudentSummaryList = studentSummaryList;
    renderStudentDirectory(studentSummaryList);

    // 5. Update Charts
    updateCharts(gachaData, studentSummaryList);
  }

  // Render History Table rows
  function renderHistoryTable(data = gachaData, filter = currentHistoryFilter, searchQuery = historySearchQuery) {
    const tableBody = document.getElementById('gachaHistoryTable').querySelector('tbody');
    const badge = document.getElementById('tableFilterCountBadge');
    document.getElementById('tableRowCount').textContent = data.length;
    
    if (data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
            データがありません。「データ連携・入力」タブからスプレッドシートのURLを登録するか、手動で貼り付けてください。
          </td>
        </tr>`;
      if (badge) badge.style.display = 'none';
      return;
    }

    let filteredData = data;
    if (filter === 'threeStar') {
      filteredData = data.filter(row => row.threeStarCount > 0);
    } else if (filter === 'pickup') {
      filteredData = data.filter(row => row.pickupCount > 0 || (row.studentBgs && row.studentBgs.includes('pickup')));
    } else if (filter === 'new') {
      filteredData = data.filter(row => row.newCount > 0 || (row.studentBgs && row.studentBgs.includes('new')));
    } else if (filter === 'normal') {
      filteredData = data.filter(row => row.baseRate === 3);
    } else if (filter === 'anniv') {
      filteredData = data.filter(row => row.baseRate === 6);
    } else if (filter === 'rate50') {
      filteredData = data.filter(row => row.baseRate === 50);
    } else if (filter === 'rate100') {
      filteredData = data.filter(row => row.baseRate === 100);
    }

    // Apply incremental text search (student names, date, remarks, pulls)
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      filteredData = filteredData.filter(row => {
        const matchName = row.studentNames && row.studentNames.some(n => n.toLowerCase().includes(q));
        const matchDate = row.date && String(row.date).toLowerCase().includes(q);
        const matchRemark = row.guaranteeInfo && String(row.guaranteeInfo).toLowerCase().includes(q);
        const matchPulls = String(row.cumulativePulls).includes(q) || `${row.baseRate}%`.includes(q);
        return matchName || matchDate || matchRemark || matchPulls;
      });
    }

    // Update filter badge
    if (badge) {
      if (filteredData.length !== data.length) {
        badge.textContent = `表示: ${filteredData.length} 件`;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Sort according to currentSortKey & currentSortOrder
    const sortedData = [...filteredData].sort((a, b) => {
      let valA = a[currentSortKey];
      let valB = b[currentSortKey];

      // Handle date type comparison
      if (currentSortKey === 'date') {
        valA = parseDateToTimestamp(a.date);
        valB = parseDateToTimestamp(b.date);
      }

      // Handle undefined/nulls safely
      if (valA === undefined || valA === null) valA = 0;
      if (valB === undefined || valB === null) valB = 0;

      if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;

      // Tie-breaker when values are identical
      if (currentSortKey === 'date') {
        return currentSortOrder === 'asc' 
          ? a.cumulativePulls - b.cumulativePulls 
          : b.cumulativePulls - a.cumulativePulls;
      } else {
        const dateA = parseDateToTimestamp(a.date);
        const dateB = parseDateToTimestamp(b.date);
        if (dateA !== dateB) return dateB - dateA;
        return b.cumulativePulls - a.cumulativePulls;
      }
    });

    let html = '';
    sortedData.forEach(row => {
      let studentsHtml = '';
      row.studentNames.forEach((name, idx) => {
        const type = row.studentBgs[idx] || 'regular';
        const cssClass = type === 'pickup' ? 'pickup' : type === 'new' ? 'new' : 'regular';
        const avatarUrl = getStudentIcon(name) || '';
        const imgHtml = avatarUrl ? `<img src="${avatarUrl}" class="table-student-avatar" alt="${name}">` : '';
        studentsHtml += `<span class="student-tag ${cssClass}">${imgHtml}${name}</span>`;
      });

      let guaranteeBadge = '-';
      if (row.guaranteeInfo !== '') {
        const isWin = /○|1|成功|勝|win|pickup/i.test(row.guaranteeInfo);
        guaranteeBadge = `<span class="badge ${isWin ? 'success' : 'danger'}">${row.guaranteeInfo}</span>`;
      } else if (row.baseRate === 50) {
        const hasColorPickup = row.studentBgs && row.studentBgs.some(bg => bg === 'pickup');
        const isWin = row.pickupCount > 0 || hasColorPickup;
        guaranteeBadge = `<span class="badge ${isWin ? 'success' : 'danger'}">${isWin ? '成功' : 'すり抜け'}</span>`;
      }

      html += `
        <tr>
          <td>${row.cumulativePulls}</td>
          <td>${row.date}</td>
          <td>${row.pullsCount}</td>
          <td>${row.threeStarCount}</td>
          <td>${row.pickupCount}</td>
          <td>${row.newCount}</td>
          <td>${row.ownedCount}</td>
          <td>${studentsHtml || '-'}</td>
          <td>${row.baseRate}%</td>
          <td>${guaranteeBadge}</td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  }

  // Render Student Directory grid
  function renderStudentDirectory(students = globalStudentSummaryList, filter = currentDirectoryFilter, searchQuery = directorySearchQuery, sortKey = currentDirectorySort) {
    const container = document.getElementById('studentDirectoryContainer');
    const badge = document.getElementById('dirFilterCountBadge');
 
    let filtered = students;
    if (filter === 'pickup') {
      filtered = students.filter(s => s.type === 'pickup');
    } else if (filter === 'new') {
      filtered = students.filter(s => s.type === 'new');
    } else if (filter === 'spook') {
      filtered = students.filter(s => s.type === 'regular');
    } else if (filter === 'rate50') {
      filtered = students.filter(s => s.baseRate === 50);
    } else if (filter === 'rate100') {
      filtered = students.filter(s => s.baseRate === 100);
    }

    // Apply incremental student name search
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(q));
    }

    // Calculate total count for each student across dataset
    const studentCountMap = {};
    students.forEach(s => {
      studentCountMap[s.name] = (studentCountMap[s.name] || 0) + 1;
    });

    // Custom sorting
    const sortedStudents = [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        return a.name.localeCompare(b.name, 'ja');
      } else if (sortKey === 'count') {
        const countDiff = (studentCountMap[b.name] || 0) - (studentCountMap[a.name] || 0);
        if (countDiff !== 0) return countDiff;
      } else if (sortKey === 'oldest') {
        const tA = parseDateToTimestamp(a.date);
        const tB = parseDateToTimestamp(b.date);
        if (tA !== tB) return tA - tB;
        if ((a.cumulativePulls || 0) !== (b.cumulativePulls || 0)) {
          return (a.cumulativePulls || 0) - (b.cumulativePulls || 0);
        }
        return (a.drawNumber || 0) - (b.drawNumber || 0);
      }

      // Default: 'recent' (newest first)
      const tA = parseDateToTimestamp(a.date);
      const tB = parseDateToTimestamp(b.date);
      if (tA !== tB) return tB - tA;
      if ((a.cumulativePulls || 0) !== (b.cumulativePulls || 0)) {
        return (b.cumulativePulls || 0) - (a.cumulativePulls || 0);
      }
      return (b.drawNumber || 0) - (a.drawNumber || 0);
    });
 
    document.getElementById('directoryCount').textContent = students.length;
    if (badge) {
      if (sortedStudents.length !== students.length) {
        badge.textContent = `表示: ${sortedStudents.length} 名`;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
 
    if (sortedStudents.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">
          獲得した☆3生徒がまだ記録されていません。
        </div>`;
      return;
    }
 
    let html = '';
    sortedStudents.forEach(student => {
      let bgClass = '';
      let typeLabel = 'すり抜け(被り)';
      
      if (student.baseRate === 100) {
        typeLabel = '交換';
      } else if (student.type === 'pickup') {
        bgClass = 'pickup';
        typeLabel = 'ピックアップ';
      } else if (student.type === 'new') {
        bgClass = 'new';
        typeLabel = '新規獲得';
      }
 
      const avatarUrl = getStudentIcon(student.name) || '';
      const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" class="student-avatar" alt="${student.name}" style="margin: 0;">` 
        : `<div class="student-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;color:var(--text-muted);font-size:18px;margin: 0;">${student.name.charAt(0)}</div>`;
 
      const bgBlurHtml = avatarUrl 
        ? `<div class="student-card-bg" style="background-image: url('${avatarUrl}');"></div>` 
        : '';
 
      // Create "X回目" badge for duplicates (2nd pull or later)
      let drawBadgeHtml = '';
      if (student.drawNumber > 1) {
        drawBadgeHtml = `<span class="draw-count-badge">${student.drawNumber}回目</span>`;
      }
 
      let statusClass = 'status-other';
      if (student.baseRate === 100) {
        statusClass = 'status-100';
      } else if (student.type === 'pickup') {
        statusClass = 'status-pickup';
      } else if (student.type === 'new') {
        statusClass = 'status-new';
      } else if (student.baseRate === 50) {
        statusClass = 'status-50';
      }

      html += `
        <div class="student-card ${statusClass}">
          ${bgBlurHtml}
          <div style="position: relative; z-index: 2;">
            <div class="avatar-container" style="width: 55px; height: 55px; margin: 0 auto 8px auto; position: relative;">
              ${avatarHtml}
              ${drawBadgeHtml}
            </div>
            <div class="student-card-name" title="${student.name}">${student.name}</div>
            <div class="student-card-type">${typeLabel}</div>
            <div class="student-card-date">${student.date || ''}</div>
          </div>
        </div>
      `;
    });
 
    container.innerHTML = html;
  }

  // Handle table filtering
  function initFilters() {
    const filterButtons = document.querySelectorAll('[data-filter]');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentHistoryFilter = btn.getAttribute('data-filter');
        renderHistoryTable();
      });
    });
    const dirFilterButtons = document.querySelectorAll('[data-dir-filter]');
    dirFilterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        dirFilterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDirectoryFilter = btn.getAttribute('data-dir-filter');
        renderStudentDirectory();
      });
    });
  }

  // Initialize Search inputs, Sort selector, and Filter controls
  function initSearchAndFilterListeners() {
    // 1. History Table Search
    const histSearch = document.getElementById('historySearchInput');
    const clearHistBtn = document.getElementById('clearHistorySearchBtn');
    if (histSearch) {
      histSearch.addEventListener('input', (e) => {
        historySearchQuery = e.target.value;
        if (clearHistBtn) {
          clearHistBtn.style.display = historySearchQuery ? 'block' : 'none';
        }
        renderHistoryTable();
      });
    }
    if (clearHistBtn) {
      clearHistBtn.addEventListener('click', () => {
        if (histSearch) {
          histSearch.value = '';
          historySearchQuery = '';
          clearHistBtn.style.display = 'none';
          renderHistoryTable();
        }
      });
    }

    // 2. Student Directory Search
    const dirSearch = document.getElementById('dirSearchInput');
    const clearDirBtn = document.getElementById('clearDirSearchBtn');
    if (dirSearch) {
      dirSearch.addEventListener('input', (e) => {
        directorySearchQuery = e.target.value;
        if (clearDirBtn) {
          clearDirBtn.style.display = directorySearchQuery ? 'block' : 'none';
        }
        renderStudentDirectory();
      });
    }
    if (clearDirBtn) {
      clearDirBtn.addEventListener('click', () => {
        if (dirSearch) {
          dirSearch.value = '';
          directorySearchQuery = '';
          clearDirBtn.style.display = 'none';
          renderStudentDirectory();
        }
      });
    }

    // 3. Student Directory Sort Select
    const dirSort = document.getElementById('dirSortSelect');
    if (dirSort) {
      dirSort.addEventListener('change', (e) => {
        currentDirectorySort = e.target.value;
        renderStudentDirectory();
      });
    }
  }

  // Handle table column sorting
  function initTableSorting() {
    const headers = document.querySelectorAll('table.gacha-table th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const sortKey = header.getAttribute('data-sort');
        if (currentSortKey === sortKey) {
          // Toggle order
          currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortKey = sortKey;
          currentSortOrder = 'desc'; // Default to newest/highest first
        }

        // Update header visual indicators
        headers.forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        header.classList.add(currentSortOrder === 'asc' ? 'sort-asc' : 'sort-desc');

        // Re-render table
        renderHistoryTable(gachaData, currentHistoryFilter);
      });
    });
  }

  // Update Charts using Chart.js
  function updateCharts(data = gachaData, students = []) {
    try {
      if (!data || data.length === 0) return;

      // Filter out 0-pulls rows to eliminate duplicates
      const chartData = data.filter(row => row.pullsCount > 0);
      if (chartData.length === 0) return;

      // ----------------------------------------------------
      // Chart 1: Cumulative Rate Convergence Line Chart
      // ----------------------------------------------------
      const lineCtx = document.getElementById('rateConvergenceChart');
      if (lineCtx) {
        // Find all unique base rates in the data
        const uniqueRates = [...new Set(chartData.map(row => row.baseRate))].filter(r => r > 0).sort((a, b) => a - b);
        
        // Prepend 0-pull starting baseline
        const labels = ['0連'];
        const regDeviationPoints = [0];
        const regActualRates = [3.0];
        const regActivePoints = [true];
        const festDeviationPoints = [null];
        const festActualRates = [null];
        const festActivePoints = [false];
        
        let cumPullsReg = 0;
        let cumStarsReg = 0;
        let cumPullsFest = 0;
        let cumStarsFest = 0;
        
        let cumStarsTotal = 0;

        // Filter out 3, 6, 50, and 100 to prevent drawing lines for guarantee/spark systems
        const otherRates = uniqueRates.filter(r => r !== 3 && r !== 6 && r !== 50 && r !== 100);
        const otherTrackers = {};
        otherRates.forEach(r => {
          otherTrackers[r] = { pulls: 0, stars: 0, points: [null], actualRates: [null], activePoints: [false] };
        });

        // Group data into chronological sessions by date
        const sessions = [];
        let currentSession = null;
        let totalCumPulls = 0;

        chartData.forEach((row, rowIndex) => {
          const pullsStart = totalCumPulls;
          totalCumPulls += row.pullsCount;
          const pullsEnd = totalCumPulls;

          // Session grouping by date (offset indices by 1 due to prepended '0連')
          if (!currentSession || currentSession.date !== row.date) {
            if (currentSession) {
              sessions.push(currentSession);
            }
            currentSession = {
              date: row.date,
              isFest: row.baseRate === 6,
              startIdx: rowIndex + 1,
              endIdx: rowIndex + 1,
              pullsCount: row.pullsCount,
              startPulls: pullsStart,
              endPulls: pullsEnd
            };
          } else {
            currentSession.endIdx = rowIndex + 1;
            currentSession.pullsCount += row.pullsCount;
            currentSession.endPulls = pullsEnd;
          }

          labels.push(`${totalCumPulls}連`);

          const star3Added = row.threeStarCount;
          const currentRate = row.baseRate;

          if (currentRate === 6) {
            cumPullsFest += row.pullsCount;
            cumStarsFest += star3Added;
          } else if (currentRate === 3) {
            cumPullsReg += row.pullsCount;
            cumStarsReg += star3Added;
          } else if (otherTrackers[currentRate]) {
            otherTrackers[currentRate].pulls += row.pullsCount;
            otherTrackers[currentRate].stars += star3Added;
          }

          if (star3Added > 0) {
            cumStarsTotal += star3Added;
          }

          // Record active/inactive state for this step
          regActivePoints.push(currentRate === 3);
          festActivePoints.push(currentRate === 6);
          otherRates.forEach(r => {
            otherTrackers[r].activePoints.push(currentRate === r);
          });

          // 1. Regular 3% deviation & actual rate
          const actualRegRate = cumPullsReg > 0 ? (cumStarsReg / cumPullsReg) * 100 : 3.0;
          const regDeviation = ((actualRegRate - 3.0) / 3.0) * 100;
          regDeviationPoints.push(parseFloat(regDeviation.toFixed(1)));
          regActualRates.push(parseFloat(actualRegRate.toFixed(2)));

          // 2. Fest 6% deviation & actual rate
          if (cumPullsFest > 0) {
            const actualFestRate = (cumStarsFest / cumPullsFest) * 100;
            const festDeviation = ((actualFestRate - 6.0) / 6.0) * 100;
            festDeviationPoints.push(parseFloat(festDeviation.toFixed(1)));
            festActualRates.push(parseFloat(actualFestRate.toFixed(2)));
          } else {
            festDeviationPoints.push(null);
            festActualRates.push(null);
          }

          // 3. Other rates deviation & actual rates
          otherRates.forEach(r => {
            const tracker = otherTrackers[r];
            if (tracker.pulls > 0) {
              const actualRate = (tracker.stars / tracker.pulls) * 100;
              const deviation = ((actualRate - r) / r) * 100;
              tracker.points.push(parseFloat(deviation.toFixed(1)));
              tracker.actualRates.push(parseFloat(actualRate.toFixed(2)));
            } else {
              tracker.points.push(null);
              tracker.actualRates.push(null);
            }
          });
        });

        if (currentSession) {
          sessions.push(currentSession);
        }

        const colors = {
          3: '#00b4d8',  // Nice ocean blue for 3%
          6: '#ff3e6c',  // Red/Pink for 6%
          40: '#ffc107'  // Amber/Yellow
        };

        function getRateColor(rate) {
          if (colors[rate]) return colors[rate];
          const hue = (rate * 37) % 360;
          return `hsl(${hue}, 80%, 50%)`;
        }

        // Build datasets for relative error deviation
        const datasets = [
          {
            label: '理論値基準線 (0%)',
            data: Array(chartData.length + 1).fill(0),
            borderColor: 'rgba(31, 41, 55, 0.4)', // Darker gray for light theme
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: '3%',
            data: regDeviationPoints,
            activePoints: regActivePoints,
            actualRates: regActualRates,
            borderColor: colors[3],
            backgroundColor: 'transparent',
            borderWidth: 3,
            fill: false,
            tension: 0.15,
            pointRadius: chartData.length > 50 ? 0 : 2.5,
            spanGaps: true,
            segment: {
              borderDash: ctx => {
                if (!ctx || typeof ctx.p0DataIndex === 'undefined') return [5, 4];
                const idx = ctx.p0DataIndex;
                const chart = ctx.chart;
                if (!chart || !chart.data || !chart.data.datasets) return [5, 4];
                const dataset = chart.data.datasets[ctx.datasetIndex];
                const active = dataset ? dataset.activePoints : null;
                return active && active[idx] ? undefined : [5, 4];
              }
            }
          }
        ];

        if (cumPullsFest > 0) {
          datasets.push({
            label: '6%',
            data: festDeviationPoints,
            activePoints: festActivePoints,
            actualRates: festActualRates,
            borderColor: colors[6],
            backgroundColor: 'transparent',
            borderWidth: 3,
            fill: false,
            tension: 0.15,
            pointRadius: chartData.length > 50 ? 0 : 2.5,
            spanGaps: true,
            segment: {
              borderDash: ctx => {
                if (!ctx || typeof ctx.p0DataIndex === 'undefined') return [5, 4];
                const idx = ctx.p0DataIndex;
                const chart = ctx.chart;
                if (!chart || !chart.data || !chart.data.datasets) return [5, 4];
                const dataset = chart.data.datasets[ctx.datasetIndex];
                const active = dataset ? dataset.activePoints : null;
                return active && active[idx] ? undefined : [5, 4];
              }
            }
          });
        }

        otherRates.forEach(r => {
          const tracker = otherTrackers[r];
          if (tracker.pulls > 0) {
            datasets.push({
              label: `特別${r}% 乖離率`,
              data: tracker.points,
              activePoints: tracker.activePoints,
              actualRates: tracker.actualRates,
              borderColor: getRateColor(r),
              backgroundColor: 'transparent',
              borderWidth: 3,
              fill: false,
              tension: 0.15,
              pointRadius: chartData.length > 50 ? 0 : 2.5,
              spanGaps: true,
              segment: {
                borderDash: ctx => {
                  if (!ctx || typeof ctx.p0DataIndex === 'undefined') return [5, 4];
                  const idx = ctx.p0DataIndex;
                  const chart = ctx.chart;
                  if (!chart || !chart.data || !chart.data.datasets) return [5, 4];
                  const dataset = chart.data.datasets[ctx.datasetIndex];
                  const active = dataset ? dataset.activePoints : null;
                  return active && active[idx] ? undefined : [5, 4];
                }
              }
            });
          }
        });

        if (rateChart) {
          rateChart.destroy();
        }

        // Custom Plugin to draw session dividers and top pill labels
        const sessionDividerPlugin = {
          id: 'sessionDivider',
          beforeDatasetsDraw(chart) {
            try {
              const { ctx, chartArea: { top, bottom } } = chart;
              ctx.save();

              if (!chart.data || !chart.data.datasets) {
                ctx.restore();
                return;
              }

              const regMetaIdx = chart.data.datasets.findIndex(d => d.label && (d.label === '3%' || d.label.includes('3%')));
              if (regMetaIdx === -1 || regMetaIdx >= chart.data.datasets.length) {
                ctx.restore();
                return;
              }
              const meta = chart.getDatasetMeta(regMetaIdx);
              if (!meta || !meta.data || meta.data.length === 0) {
                ctx.restore();
                return;
              }

              sessions.forEach((session, idx) => {
                if (session.startIdx >= meta.data.length || session.endIdx >= meta.data.length) return;
                const startPoint = meta.data[session.startIdx];
                const endPoint = meta.data[session.endIdx];
                if (!startPoint || !endPoint) return;

                const xStart = startPoint.x;
                const xEnd = endPoint.x;
                if (typeof xStart !== 'number' || typeof xEnd !== 'number' || isNaN(xStart) || isNaN(xEnd)) return;

                // 1. Shading background for Fest sessions or normal sessions (stronger light-mode colors)
                if (session.isFest) {
                  ctx.fillStyle = 'rgba(255, 62, 108, 0.055)';
                  ctx.fillRect(xStart, top, xEnd - xStart, bottom - top);
                } else {
                  ctx.fillStyle = 'rgba(0, 174, 239, 0.025)';
                  ctx.fillRect(xStart, top, xEnd - xStart, bottom - top);
                }

                // 2. Draw vertical dividing dashed lines (distinct and clear on white theme)
                if (idx < sessions.length - 1) {
                  const nextSession = sessions[idx + 1];
                  if (nextSession && nextSession.startIdx < meta.data.length) {
                    const nextStartPoint = meta.data[nextSession.startIdx];
                    if (nextStartPoint) {
                      const xNext = nextStartPoint.x;
                      if (typeof xNext === 'number' && !isNaN(xNext)) {
                        const xDiv = (xEnd + xNext) / 2;
                        ctx.strokeStyle = 'rgba(142, 155, 180, 0.65)'; // strong dividing line
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([5, 4]);
                        ctx.beginPath();
                        ctx.moveTo(xDiv, top);
                        ctx.lineTo(xDiv, bottom);
                        ctx.stroke();
                      }
                    }
                  }
                }
              });
              ctx.restore();
            } catch (err) {
              console.error("Error in beforeDatasetsDraw:", err);
            }
          },
          afterDatasetsDraw(chart) {
            try {
              const { ctx, chartArea: { top, bottom, left, right } } = chart;
              ctx.save();

              if (!chart.data || !chart.data.datasets) {
                ctx.restore();
                return;
              }

              const regMetaIdx = chart.data.datasets.findIndex(d => d.label && (d.label === '3%' || d.label.includes('3%')));
              if (regMetaIdx === -1 || regMetaIdx >= chart.data.datasets.length) {
                ctx.restore();
                return;
              }
              const meta = chart.getDatasetMeta(regMetaIdx);
              if (!meta || !meta.data || meta.data.length === 0) {
                ctx.restore();
                return;
              }

              // 1. Draw styled pill labels (session dates)
              sessions.forEach((session) => {
                if (session.startIdx >= meta.data.length || session.endIdx >= meta.data.length) return;
                const startPoint = meta.data[session.startIdx];
                const endPoint = meta.data[session.endIdx];
                if (!startPoint || !endPoint) return;

                const xStart = startPoint.x;
                const xEnd = endPoint.x;
                if (typeof xStart !== 'number' || typeof xEnd !== 'number' || isNaN(xStart) || isNaN(xEnd)) return;
                
                const xMid = (xStart + xEnd) / 2;

                // Draw styled pill label
                const festLabel = session.isFest ? ' FEST' : '';
                const text = `${session.date}${festLabel} (${session.pullsCount}連)`;
                ctx.font = 'bold 9px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const textWidth = ctx.measureText(text).width;
                const rectWidth = textWidth + 16;
                const rectHeight = 18;
                const rectX = xMid - rectWidth / 2;
                const rectY = top + 8;

                // Drop shadow
                ctx.shadowColor = 'rgba(0, 174, 239, 0.08)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;

                // Background (pill style matching light mode)
                ctx.fillStyle = session.isFest ? '#ff3e6c' : '#ffffff';
                ctx.strokeStyle = session.isFest ? '#ff3e6c' : 'rgba(0, 174, 239, 0.35)';
                ctx.lineWidth = 1.2;
                
                ctx.beginPath();
                const r = 6;
                ctx.moveTo(rectX + r, rectY);
                ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, r);
                ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, r);
                ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, r);
                ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, r);
                ctx.fill();
                ctx.stroke();

                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // Text
                ctx.fillStyle = session.isFest ? '#ffffff' : '#007ab3';
                ctx.fillText(text, xMid, rectY + rectHeight / 2);
              });

              // 1.5 Draw the "天井交換" (Spark) box at the Y=-100% position
              const yMinus100 = (chart.scales && chart.scales.y) ? chart.scales.y.getPixelForValue(-100) : (top + (bottom - top) * 0.93);
              const boxHeight = 36;
              const boxTop = yMinus100 - boxHeight / 2;

              ctx.save();
              // Fill semi-transparent gray background
              ctx.fillStyle = 'rgba(230, 235, 240, 0.45)'; 
              ctx.fillRect(left, boxTop, right - left, boxHeight);

              // Draw thin border
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'; 
              ctx.lineWidth = 1;
              ctx.strokeRect(left, boxTop, right - left, boxHeight);

              // Draw "交換" text inside the box (on the left edge)
              ctx.fillStyle = '#374151'; 
              ctx.font = 'bold 11px sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText('交換', left + 8, yMinus100);
              ctx.restore();

              // 2. Draw pickup student avatars at 50% height
              chartData.forEach((row, rowIndex) => {
                const dataIdx = rowIndex + 1; // offset by 1 because of '0連' baseline
                if (dataIdx >= meta.data.length) return;
                const point = meta.data[dataIdx];
                if (!point) return;
                const x = point.x;
                if (typeof x !== 'number' || isNaN(x)) return;

                const hasColorPickup = row.studentBgs && row.studentBgs.some(bg => bg === 'pickup');

                row.studentNames.forEach((name, studentIdx) => {
                  let isPickup = false;
                  if (hasColorPickup) {
                    isPickup = (row.studentBgs[studentIdx] === 'pickup');
                  } else {
                    // Fallback for missing background colors
                    if (row.pickupCount > 0 && studentIdx === 0) {
                      isPickup = true;
                    }
                  }

                  let isDrawAvatar = false;
                  let targetYValue = 30;

                  if (row.baseRate === 100) {
                    isDrawAvatar = true;
                    targetYValue = -100;
                  } else {
                    isDrawAvatar = isPickup;
                    targetYValue = 30;
                  }

                  if (isDrawAvatar) {
                    const avatarUrl = getStudentIcon(name);
                    if (avatarUrl) {
                      let img = avatarImgCache[avatarUrl];
                      if (!img) {
                        img = new Image();
                        img.onload = () => {
                          chart.draw();
                        };
                        img.src = avatarUrl;
                        avatarImgCache[avatarUrl] = img;
                      }

                      if (img.complete && img.naturalWidth !== 0) {
                        const size = 32;
                        const r = size / 2;
                        const centerY = (chart.scales && chart.scales.y) 
                          ? chart.scales.y.getPixelForValue(targetYValue) 
                          : (targetYValue === -100 
                              ? (top + (bottom - top) * 0.93) 
                              : (top + (bottom - top) * 0.37)
                            );
                        const imgX = x - r;
                        const imgY = centerY - r;

                        ctx.save();
                        
                        // Draw circular clip path
                        ctx.beginPath();
                        ctx.arc(x, centerY, r, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        
                        // Draw image
                        ctx.drawImage(img, imgX, imgY, size, size);
                        
                        ctx.restore();

                        // Draw golden border around the avatar
                        ctx.strokeStyle = '#c5a059'; // gold/brown border matching mockup
                        ctx.lineWidth = 2.5;
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                        ctx.shadowBlur = 4;
                        ctx.beginPath();
                        ctx.arc(x, centerY, r, 0, Math.PI * 2);
                        ctx.stroke();

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'transparent';
                      }
                    }
                  }
                });
              });

              ctx.restore();
            } catch (err) {
              console.error("Error in afterDatasetsDraw:", err);
            }
          }
        };

        // Register custom tooltip positioner to show tooltip at the top of the chart area (Chart.js v3 / v4 compatible)
        if (typeof Chart !== 'undefined') {
          const positionerFn = function(elements, eventPosition) {
            const chart = this.chart;
            const { top, bottom } = chart.chartArea;
            let x = eventPosition.x;
            if (elements && elements.length > 0) {
              const lastEl = elements[elements.length - 1];
              if (lastEl && typeof lastEl.x === 'number') {
                x = lastEl.x;
              }
            }
            return {
              x: x,
              y: (chart.scales && chart.scales.y) ? chart.scales.y.getPixelForValue(70) : (top + (bottom - top) * 0.2)
            };
          };

          // 1. UMD Global / v3 namespace
          if (Chart.Tooltip && Chart.Tooltip.positioners) {
            Chart.Tooltip.positioners.customTop = positionerFn;
          }
          // 2. Default options namespace
          if (Chart.defaults && Chart.defaults.plugins && Chart.defaults.plugins.tooltip && Chart.defaults.plugins.tooltip.positioners) {
            Chart.defaults.plugins.tooltip.positioners.customTop = positionerFn;
          }
          // 3. Registry plugins namespace (v4)
          const tooltipPlugin = Chart.registry && Chart.registry.plugins && Chart.registry.plugins.get('tooltip');
          if (tooltipPlugin && tooltipPlugin.positioners) {
            tooltipPlugin.positioners.customTop = positionerFn;
          }
        }

        // Calculate dynamic min/max to keep y-axis centered and scaled
        const allVals = [...regDeviationPoints, ...festDeviationPoints].filter(v => v !== null && v !== undefined);
        let absMax = Math.max(60, Math.ceil(Math.max(...allVals.map(Math.abs)) * 1.15));
        if (isNaN(absMax) || !isFinite(absMax)) {
          absMax = 60;
        }

        rateChart = new Chart(lineCtx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: datasets
          },
          plugins: [sessionDividerPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: {
                  color: '#374151', // Dark grey legend text for light theme
                  font: { family: 'Outfit', size: 11 },
                  filter: function(item) {
                    // Hide confidence boundary lines from legend
                    return !item.text.includes('信頼限界');
                  }
                }
              },
              tooltip: {
                mode: 'index',
                intersect: false,
                position: 'customTop',
                caretSize: 0,
                backgroundColor: '#ffffff', // White tooltip background
                titleColor: '#007ab3', // Ocean blue tooltip title
                bodyColor: '#1f2937', // Dark gray tooltip body text
                borderColor: 'rgba(0, 174, 239, 0.35)', // Light blue border
                borderWidth: 1,
                titleFont: { family: 'JetBrains Mono', weight: 'bold' },
                bodyFont: { family: 'JetBrains Mono' },
                callbacks: {
                  title: function(context) {
                    return `${context[0].label}目`;
                  },
                  label: function(context) {
                    if (context.dataset.label.includes('信頼限界') || context.dataset.label.includes('基準線')) {
                      return null;
                    }
                    const val = context.parsed.y;
                    const sign = val >= 0 ? '+' : '';
                    const idx = context.dataIndex;
                    const actualRates = context.dataset.actualRates;
                    const actualVal = (actualRates && actualRates[idx] !== null && actualRates[idx] !== undefined) ? actualRates[idx] : null;

                    const cleanLabel = context.dataset.label.replace(' 乖離率', '');
                    if (actualVal !== null) {
                      return `${cleanLabel}: 実測 ${actualVal.toFixed(2)}% (偏差: ${sign}${val.toFixed(1)}%)`;
                    }
                    return `${cleanLabel}: ${sign}${val.toFixed(1)}%`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(0, 174, 239, 0.06)' }, // Light blue/gray grid lines
                ticks: { color: '#4b5563', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 }
              },
              y: {
                grid: { color: 'rgba(0, 174, 239, 0.06)' },
                ticks: { color: '#4b5563', font: { family: 'JetBrains Mono', size: 10 } },
                min: -absMax,
                max: absMax,
                title: {
                  display: true,
                  text: '理論値からの相対誤差 (%)',
                  color: '#4b5563',
                  font: { family: 'Outfit', size: 11 }
                }
              }
            }
          }
        });
      }


    } catch (err) {
      console.error("Error in updateCharts:", err);
      // Inject visible diagnostic box on error
      let diag = document.getElementById('debug_charts_error');
      if (!diag) {
        diag = document.createElement('div');
        diag.id = 'debug_charts_error';
        diag.style.position = 'fixed';
        diag.style.bottom = '10px';
        diag.style.right = '10px';
        diag.style.maxWidth = '90%';
        diag.style.background = '#ffebee';
        diag.style.color = '#c62828';
        diag.style.padding = '12px';
        diag.style.border = '2px solid #c62828';
        diag.style.borderRadius = '6px';
        diag.style.fontFamily = 'monospace';
        diag.style.fontSize = '11px';
        diag.style.zIndex = '99999';
        diag.style.overflow = 'auto';
        diag.style.maxHeight = '200px';
        diag.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
        document.body.appendChild(diag);
      }
      diag.innerHTML = `<strong>updateCharts Error:</strong><br>${err.message}<br><pre style="margin:4px 0 0 0;font-size:9px;">${err.stack}</pre>`;
    }
  }



  // Load Icons from LocalStorage, with auto-fetch fallback from data/student_icons.json
  function loadIcons() {
    try {
      studentIcons = JSON.parse(localStorage.getItem('schale_student_icons')) || {};
    } catch(e) {
      console.error('Error loading icons from storage', e);
      studentIcons = {};
    }

    // Background sync from local data/student_icons.json if available
    fetch('./data/student_icons.json')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          studentIcons = { ...data, ...studentIcons };
          localStorage.setItem('schale_student_icons', JSON.stringify(studentIcons));
          if (gachaData.length > 0) {
            aggregateAndDisplay();
          }
        }
      })
      .catch(err => {
        // Silently skip if data file is not found (e.g. standalone file without server)
      });
  }

  // Format timestamp to relative time string (e.g. "3時間前", "15分前", "2日前")
  function formatTimeAgo(timestamp) {
    if (!timestamp) return '未実施';
    const diffMs = Date.now() - parseInt(timestamp, 10);
    if (isNaN(diffMs) || diffMs < 0) return '数秒前';
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return '数秒前';
    if (diffMin < 60) return `${diffMin}分前`;
    if (diffHour < 24) return `${diffHour}時間前`;
    return `${diffDay}日前`;
  }

  // Initialize Icon Fetch button & Crawl Popups
  function initIconFetchListener() {
    const fetchBtn = document.getElementById('toggleIconImportBtn');
    const panel = document.getElementById('iconImportPanel');
    const pasteTarget = document.getElementById('iconPasteTarget');

    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => {
        const lastCrawlTime = localStorage.getItem('gacha_last_icon_crawl');
        const timeAgoStr = formatTimeAgo(lastCrawlTime);

        let confirmMsg = '';
        if (lastCrawlTime) {
          confirmMsg = `${timeAgoStr}に巡回を行いました。サイト巡回を実施しますか？`;
        } else {
          confirmMsg = `まだサイト巡回を行っていません。最新のWiki（キャラクター一覧）へのサイト巡回を実施しますか？`;
        }

        const isOk = window.confirm(confirmMsg);
        if (isOk) {
          crawlWikiIcons();
        }
      });
    }

    // Manual backup paste listener inside collapsible panel
    if (pasteTarget) {
      pasteTarget.addEventListener('paste', (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        if (html) {
          const newIcons = parseWikiIconsHTML(html);
          const count = Object.keys(newIcons).length;
          if (count > 0) {
            studentIcons = { ...studentIcons, ...newIcons };
            localStorage.setItem('schale_student_icons', JSON.stringify(studentIcons));
            localStorage.setItem('gacha_last_icon_crawl', Date.now());
            
            const statusDiv = document.getElementById('iconImportStatus');
            if (statusDiv) {
              statusDiv.textContent = `登録完了: ${count}名の顔アイコンを登録・更新しました！`;
              statusDiv.style.display = 'block';
            }
            aggregateAndDisplay();
          } else {
            alert('キャラクターアイコンが検出されませんでした。コピーした範囲を確認してください。');
          }
        } else {
          alert('HTMLデータがありません。Wikiのアイコン表全体をコピーして貼り付けてください。');
        }
      });
    }
  }

  // Crawl Wiki Icons directly (with multi-tier fallback for CORS)
  async function crawlWikiIcons() {
    const fetchBtn = document.getElementById('toggleIconImportBtn');
    const originalText = fetchBtn ? fetchBtn.textContent : '';
    if (fetchBtn) {
      fetchBtn.textContent = '⏳ 巡回中...';
      fetchBtn.disabled = true;
    }

    const wikiUrl = 'https://bluearchive.wikiru.jp/?%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E4%B8%80%E8%A6%A7';
    let htmlContent = '';
    let success = false;

    // 1. Try public CORS proxy
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(wikiUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        htmlContent = await res.text();
        success = true;
      }
    } catch (e) {
      console.warn('Proxy fetch failed, falling back to direct or json data', e);
    }

    // 2. If proxy failed, try direct fetch (works if CORS is disabled or extension active)
    if (!success) {
      try {
        const res = await fetch(wikiUrl);
        if (res.ok) {
          htmlContent = await res.text();
          success = true;
        }
      } catch (e) {
        // Direct fetch blocked by CORS
      }
    }

    if (success && htmlContent) {
      const crawledIcons = parseWikiIconsHTML(htmlContent);
      const count = Object.keys(crawledIcons).length;
      if (count > 0) {
        studentIcons = { ...studentIcons, ...crawledIcons };
        localStorage.setItem('schale_student_icons', JSON.stringify(studentIcons));
        localStorage.setItem('gacha_last_icon_crawl', Date.now());
        aggregateAndDisplay();

        if (fetchBtn) {
          fetchBtn.textContent = originalText;
          fetchBtn.disabled = false;
        }
        alert(`✅ サイト巡回が完了しました！\nWikiから最新の ${count} 名の生徒アイコンを取得・更新しました。`);
        return;
      }
    }

    // 3. Fallback: load from local repository data/student_icons.json
    try {
      const res = await fetch('./data/student_icons.json');
      if (res.ok) {
        const data = await res.json();
        const count = Object.keys(data).length;
        studentIcons = { ...studentIcons, ...data };
        localStorage.setItem('schale_student_icons', JSON.stringify(studentIcons));
        localStorage.setItem('gacha_last_icon_crawl', Date.now());
        aggregateAndDisplay();

        if (fetchBtn) {
          fetchBtn.textContent = originalText;
          fetchBtn.disabled = false;
        }
        alert(`✅ 巡回完了（リポジトリ同期）:\n最新の生徒アイコンデータベース（${count}名）を反映しました。`);
        return;
      }
    } catch (e) {
      console.error('Fallback icon load failed', e);
    }

    if (fetchBtn) {
      fetchBtn.textContent = originalText;
      fetchBtn.disabled = false;
    }
    alert('サイト巡回に失敗しました。ネットワーク接続をご確認いただくか、手動での表貼り付けをお試しください。');
  }

  // Initialize Google Spreadsheet Auto-Sync
  function initSpreadsheetSync() {
    const urlInput = document.getElementById('spreadsheetUrlInput');
    const saveBtn = document.getElementById('saveAndSyncSheetBtn');
    const syncBtn = document.getElementById('syncNowBtn');
    const clearBtn = document.getElementById('clearSheetUrlBtn');
    const badge = document.getElementById('sheetSyncBadge');
    const msgDiv = document.getElementById('sheetSyncMessage');
    const headerStatus = document.getElementById('headerSyncStatus');
    const headerText = document.getElementById('headerSyncText');

    const savedUrl = localStorage.getItem('gacha_spreadsheet_url');
    if (savedUrl) {
      urlInput.value = savedUrl;
      syncBtn.style.display = 'inline-flex';
      clearBtn.style.display = 'inline-flex';
      badge.textContent = '連携中';
      badge.className = 'status-pill status-pill-success';

      // Auto-crawl on startup!
      syncSpreadsheet(savedUrl, true);
    }

    // Save & Sync button
    saveBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) {
        alert('GoogleスプレッドシートのURLを入力してください。');
        return;
      }
      syncSpreadsheet(url, false);
    });

    // Re-sync button
    syncBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        syncSpreadsheet(url, false);
      }
    });

    // Clear connection button
    clearBtn.addEventListener('click', () => {
      if (window.confirm('スプレッドシートとの連携を解除しますか？\n（※現在表示されているデータはローカルストレージに残ります）')) {
        localStorage.removeItem('gacha_spreadsheet_url');
        localStorage.removeItem('gacha_last_sync_time');
        urlInput.value = '';
        syncBtn.style.display = 'none';
        clearBtn.style.display = 'none';
        badge.textContent = '未連携';
        badge.className = 'status-pill status-pill-idle';
        if (msgDiv) msgDiv.style.display = 'none';
        if (headerStatus) headerStatus.style.display = 'none';
      }
    });

    // Toggle Sheet Setup Guide
    const guideBtn = document.getElementById('toggleSheetGuideBtn');
    const guidePanel = document.getElementById('sheetSetupGuide');
    if (guideBtn && guidePanel) {
      guideBtn.addEventListener('click', () => {
        const isVisible = guidePanel.style.display !== 'none';
        guidePanel.style.display = isVisible ? 'none' : 'block';
        guideBtn.textContent = isVisible ? '❓ 共有設定ガイド' : '✕ ガイドを閉じる';
      });
    }

    async function syncSpreadsheet(url, isAuto = false) {
      // Extract sheetId and gid
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        alert('無効なGoogleスプレッドシートURLです。「/d/スプレッドシートID」が含まれているかご確認ください。');
        return;
      }

      const sheetId = sheetIdMatch[1];
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : null;

      // Update UI to syncing state
      badge.textContent = '同期中...';
      badge.className = 'status-pill status-pill-syncing';
      if (headerStatus) {
        headerStatus.style.display = 'flex';
        headerText.textContent = 'スプレッドシート同期中...';
      }

      const csvExportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
      let csvContent = '';
      let fetchSuccess = false;

      // 1. Direct fetch
      try {
        const res = await fetch(csvExportUrl);
        if (res.ok) {
          csvContent = await res.text();
          fetchSuccess = true;
        }
      } catch (e) {
        // Direct fetch failed (CORS)
      }

      // 2. Fallback: CORS proxy
      if (!fetchSuccess) {
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvExportUrl)}`;
          const res = await fetch(proxyUrl);
          if (res.ok) {
            csvContent = await res.text();
            fetchSuccess = true;
          }
        } catch (e) {
          console.error('Proxy fetch for spreadsheet failed', e);
        }
      }

      // 3. Fallback: gviz/tq export
      if (!fetchSuccess) {
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gvizUrl)}`;
          const res = await fetch(proxyUrl);
          if (res.ok) {
            csvContent = await res.text();
            fetchSuccess = true;
          }
        } catch (e) {
          console.error('Gviz fetch failed', e);
        }
      }

      if (fetchSuccess && csvContent) {
        const parsedRows = parseCSVText(csvContent);
        if (parsedRows && parsedRows.length > 0) {
          // Process and store
          processRawRows(parsedRows);
          localStorage.setItem('schale_gacha_data', JSON.stringify(parsedRows));
          localStorage.setItem('gacha_spreadsheet_url', url);
          localStorage.setItem('gacha_last_sync_time', Date.now());

          // Update UI
          badge.textContent = '連携中 (最新)';
          badge.className = 'status-pill status-pill-success';
          syncBtn.style.display = 'inline-flex';
          clearBtn.style.display = 'inline-flex';

          const totalPulls = gachaData.reduce((acc, r) => acc + r.pullsCount, 0);
          const total3Star = gachaData.reduce((acc, r) => acc + r.threeStarCount, 0);
          const nowStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

          if (msgDiv) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = 'rgba(var(--success-rgb), 0.1)';
            msgDiv.style.color = 'var(--success)';
            msgDiv.style.border = '1px solid rgba(var(--success-rgb), 0.3)';
            msgDiv.innerHTML = `<strong>✅ 同期完了 (${nowStr}):</strong> ${parsedRows.length}行のデータを取得しました（総ガチャ: ${totalPulls}連、☆3獲得: ${total3Star}名）。`;
          }

          // Update detailed sync status panel
          const detailPanel = document.getElementById('sheetSyncDetail');
          const detailTime = document.getElementById('syncDetailTime');
          const detailRows = document.getElementById('syncDetailRows');
          const detailGid = document.getElementById('syncDetailGid');
          if (detailPanel) {
            detailPanel.style.display = 'flex';
            if (detailTime) detailTime.textContent = new Date().toLocaleString('ja-JP');
            if (detailRows) detailRows.textContent = `${parsedRows.length} 行 / ☆3: ${total3Star} 名 (総計 ${totalPulls}連)`;
            if (detailGid) detailGid.textContent = `ID: ${sheetId.substring(0, 8)}... ${gid ? `(gid: ${gid})` : '(先頭シート)'}`;
          }

          if (headerStatus) {
            headerStatus.style.display = 'flex';
            headerText.textContent = `同期完了 (${nowStr})`;
          }

          if (!isAuto) {
            alert(`✅ スプレッドシートの同期が完了しました！\n取得行数: ${parsedRows.length}行\n総ガチャ回数: ${totalPulls}連\n☆3生徒数: ${total3Star}名`);
          }
          return;
        }
      }

      // Sync failed
      badge.textContent = '同期エラー';
      badge.className = 'status-pill status-pill-error';
      if (headerStatus) {
        headerStatus.style.display = 'flex';
        headerText.textContent = '同期エラー';
      }
      if (msgDiv) {
        msgDiv.style.display = 'block';
        msgDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        msgDiv.style.color = '#ef4444';
        msgDiv.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        msgDiv.innerHTML = `<strong>⚠️ 同期失敗:</strong> スプレッドシートからデータを取得できませんでした。<br>右上の「❓ 共有設定ガイド」をご確認の上、スプレッドシートの権限を「リンクを知っている全員（閲覧者）」に設定してください。`;
      }
      if (guidePanel) {
        guidePanel.style.display = 'block';
        if (guideBtn) guideBtn.textContent = '✕ ガイドを閉じる';
      }
      if (!isAuto) {
        alert('スプレッドシートの取得に失敗しました。\n・スプレッドシートが「リンクを知っている全員が閲覧可」になっているか確認してください。\n・URL形式が正しいか確認してください。');
      }
    }
  }

  // Initialize Data Backup and Restore (JSON)
  function initBackupRestoreListener() {
    const exportBtn = document.getElementById('btnExportBackupJson');
    const triggerImportBtn = document.getElementById('btnTriggerImportJson');
    const fileInput = document.getElementById('backupFileInput');
    const resetBtn = document.getElementById('btnResetAllData');
    const statusMsg = document.getElementById('backupStatusMessage');

    function showStatus(text, isError = false) {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
        statusMsg.style.color = isError ? '#ef4444' : 'var(--success)';
        statusMsg.style.border = `1px solid ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`;
        statusMsg.innerHTML = text;
        setTimeout(() => {
          if (statusMsg) statusMsg.style.display = 'none';
        }, 6000);
      }
    }

    // Export JSON
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const backupData = {
          version: APP_VERSION,
          exportedAt: new Date().toISOString(),
          spreadsheetUrl: localStorage.getItem('gacha_spreadsheet_url') || '',
          lastSyncTime: localStorage.getItem('gacha_last_sync_time') || null,
          lastIconCrawl: localStorage.getItem('gacha_last_icon_crawl') || null,
          studentIcons: JSON.parse(localStorage.getItem('schale_student_icons') || '{}'),
          gachaData: JSON.parse(localStorage.getItem('schale_gacha_data') || '[]')
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const fileName = `gacha_tabulation_backup_${timestamp}.json`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        showStatus(`✅ バックアップファイル <code>${fileName}</code> を保存しました！`);
      });
    }

    // Trigger Import File Dialog
    if (triggerImportBtn && fileInput) {
      triggerImportBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
    }

    // Handle File Import
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            if (!data || typeof data !== 'object') {
              throw new Error('無効なJSONフォーマットです。');
            }

            // Restore gacha data
            if (Array.isArray(data.gachaData)) {
              localStorage.setItem('schale_gacha_data', JSON.stringify(data.gachaData));
              processRawRows(data.gachaData);
            }

            // Restore icons
            if (data.studentIcons && typeof data.studentIcons === 'object') {
              studentIcons = { ...studentIcons, ...data.studentIcons };
              localStorage.setItem('schale_student_icons', JSON.stringify(studentIcons));
            }

            // Restore URL & timestamps
            if (data.spreadsheetUrl) {
              localStorage.setItem('gacha_spreadsheet_url', data.spreadsheetUrl);
              const urlInput = document.getElementById('spreadsheetUrlInput');
              if (urlInput) urlInput.value = data.spreadsheetUrl;
            }
            if (data.lastIconCrawl) localStorage.setItem('gacha_last_icon_crawl', data.lastIconCrawl);
            if (data.lastSyncTime) localStorage.setItem('gacha_last_sync_time', data.lastSyncTime);

            showStatus(`✅ 復元完了: バックアップデータを正常にインポートしました！`);
            aggregateAndDisplay();
          } catch (err) {
            console.error('Import backup error:', err);
            showStatus(`❌ インポート失敗: 正しいバックアップJSONファイルを選択してください。`, true);
          }
        };
        reader.readAsText(file);
      });
    }

    // Reset All Data
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const confirmed = window.confirm(
          '⚠️ 注意:\nすべてのガチャデータ、登録したスプレッドシートURL、取得したアイコンキャッシュを初期化します。\nこの操作は元に戻せません。よろしいですか？'
        );
        if (confirmed) {
          localStorage.removeItem('schale_gacha_data');
          localStorage.removeItem('gacha_spreadsheet_url');
          localStorage.removeItem('gacha_last_sync_time');
          localStorage.removeItem('gacha_last_icon_crawl');
          localStorage.removeItem('schale_student_icons');
          alert('すべてのデータを初期化しました。');
          location.reload();
        }
      });
    }
  }

  // Initialize Sample & Template Generator
  function initSampleGeneratorListener() {
    const copyBtn = document.getElementById('btnCopySampleTsv');
    const downloadBtn = document.getElementById('btnDownloadSampleCsv');
    const testBtn = document.getElementById('btnLoadSampleData');

    const sampleHeader = ['累計', '日付', '引', '☆3', 'pick', '新', '既', '生徒名1', '生徒名2', '生徒名3', '生徒名4', 'pick率'];
    const sampleRows = [
      ['10', '8/5', '10', '0', '', '', '', '', '', '', '', '6%'],
      ['20', '8/5', '10', '1', '1', '1', '', 'イブキ（水着）', '', '', '', '6%'],
      ['30', '8/5', '10', '2', '', '1', '1', 'ネル（制服）', 'レンゲ', '', '', '6%'],
      ['40', '8/5', '10', '0', '', '', '', '', '', '', '', '6%'],
      ['50', '8/5', '10', '1', '1', '', '1', 'イロハ（水着）', '', '', '', '6%'],
      ['60', '8/5', '10', '0', '', '', '', '', '', '', '', '6%'],
      ['70', '8/5', '10', '1', '', '', '1', 'エイミ（臨戦）', '', '', '', '6%'],
      ['80', '8/5', '10', '1', '', '', '1', 'ケイ', '', '', '', '6%'],
      ['90', '8/5', '10', '0', '', '', '', '', '', '', '', '6%'],
      ['100', '8/26', '1', '1', '1', '', '', 'ユカリ（水着）', '', '', '', '50%'],
      ['110', '8/26', '10', '1', '', '', '1', 'ウミカ', '', '', '', '3%'],
      ['120', '8/26', '10', '0', '', '', '', '', '', '', '', '3%'],
      ['200', '8/26', '1', '1', '1', '', '1', 'アリス（臨戦）', '', '', '', '100%']
    ];

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const tsvText = [sampleHeader.join('\t'), ...sampleRows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsvText).then(() => {
          const original = copyBtn.textContent;
          copyBtn.textContent = '✅ コピー完了！';
          setTimeout(() => { copyBtn.textContent = original; }, 2000);
          alert('📋 サンプルデータをクリップボードにコピーしました！\nGoogleスプレッドシートのA1セルを選択して「Ctrl + V」で貼り付けてください。');
        }).catch(err => {
          alert('クリップボードへのコピーに失敗しました。');
        });
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const csvContent = '\uFEFF' + [sampleHeader.join(','), ...sampleRows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'blue_archive_gacha_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', () => {
        if (window.confirm('サンプルデータを読み込んでダッシュボードを表示しますか？')) {
          const parsed = sampleRows.map((vals, i) => {
            const bgs = Array(vals.length).fill('');
            // Simulate colors for sample preview
            if (vals[7] === 'イブキ（水着）') bgs[7] = 'pickup';
            if (vals[8] === 'レンゲ') bgs[8] = 'new';
            if (vals[7] === 'ユカリ（水着）') bgs[7] = 'rate50';
            return { values: vals, backgrounds: bgs };
          });
          processRawRows(parsed);
          localStorage.setItem('schale_gacha_data', JSON.stringify(parsed));
          document.querySelector('[data-tab="dashboard"]').click();
        }
      });
    }
  }

  // Parse HTML format copied from Wikiru Table/Character Icon page
  function parseWikiIconsHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const trs = doc.querySelectorAll('tr');
    const iconMap = {};

    trs.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length === 0) return;

      let src = '';
      let name = '';

      tds.forEach(td => {
        const img = td.querySelector('img');
        if (img) {
          src = img.getAttribute('src') || '';
          if (img.getAttribute('data-src')) {
            src = img.getAttribute('data-src');
          }
          if (src && !src.startsWith('http') && !src.startsWith('data:')) {
            if (src.startsWith('/')) {
              src = 'https://bluearchive.wikiru.jp' + src;
            } else {
              src = 'https://bluearchive.wikiru.jp/' + src;
            }
          }
        } else {
          const text = td.textContent.trim();
          // Find the name column. It's the first text column that isn't rarity (★3) or school name
          if (text && !name && !/^★\d$/.test(text) && !/^(百鬼夜行|ゲヘナ|トリニティ|ミレニアム|山海経|レッドウィンター|ヴァルキューレ|SRT|アリウス|連邦生徒会|アビドス|シャ海)$/.test(text)) {
            name = text;
          }
        }
      });

      // Fallback: use image alt/title
      if (src && !name) {
        tds.forEach(td => {
          const img = td.querySelector('img');
          if (img) {
            const alt = img.getAttribute('alt') || '';
            const title = img.getAttribute('title') || '';
            let rawName = title || alt;
            if (rawName) {
              rawName = rawName.substring(0, rawName.lastIndexOf('.')) || rawName;
              name = rawName;
            }
          }
        });
      }

      if (name && src) {
        name = name.replace(/\[編集\]/g, '').trim();
        if (name && name.length >= 2 && !/^(スマホ|Area|編集|テーブル)/.test(name)) {
          iconMap[name] = src;
        }
      }
    });

    return iconMap;
  }

  // Lookup student icon with prefix matching (前方一致) and clean name fallbacks
  function getStudentIcon(name) {
    if (!name) return '';
    
    // 1. Exact match (e.g., "メグ" === "メグ", "ヒマリ（臨戦）" === "ヒマリ（臨戦）")
    if (studentIcons[name]) return studentIcons[name];
    
    // Clean name for fuzzy match (normalize full-width parentheses to half-width, remove spaces)
    // We do NOT strip parentheses contents (like "水着" or "臨戦") to maintain version distinction!
    const cleanName = name.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
    
    // 2. Exact match of cleaned names
    for (let key in studentIcons) {
      const cleanKey = key.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
      if (cleanName === cleanKey) return studentIcons[key];
    }
    
    // 3. Fallback matching for file versions (e.g., "タカネ" matching Wiki key "タカネ_V2")
    // Also strip file version suffixes from cleanKey and cleanName
    const cleanNameNoFileVer = cleanName.replace(/_v\d+/gi, '').replace(/_V\d+/gi, '');
    for (let key in studentIcons) {
      const cleanKeyNoFileVer = key.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/_v\d+/gi, '').replace(/_V\d+/gi, '').toLowerCase();
      if (cleanNameNoFileVer === cleanKeyNoFileVer) return studentIcons[key];
    }

    // 4. One-way versioned fallback: versioned character falls back to base character icon 
    // (e.g. Sheet name "ヒマリ(臨戦)" -> matches Wiki key "ヒマリ" if "ヒマリ(臨戦)" is missing)
    // We do NOT allow base character to match versioned character (e.g. "メグ" does NOT match "メグ(水着)")!
    // Strip parentheses contents to check if sheet name starts with wiki name
    const cleanNameNoBraces = cleanName.replace(/\(.*\)/g, '');
    for (let key in studentIcons) {
      const cleanKeyNoBraces = key.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/\(.*\)/g, '').toLowerCase();
      // If versioned name starts with base name, map it as a fallback
      if (cleanName.includes('(') && cleanNameNoBraces === cleanKeyNoBraces) {
        return studentIcons[key];
      }
    }

    // 5. Try matching filenames in URLs (e.g. "https://.../タカネ_V2.png" contains "タカネ")
    for (let key in studentIcons) {
      const url = studentIcons[key];
      try {
        const decodedUrl = decodeURIComponent(url);
        const filename = decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1, decodedUrl.lastIndexOf('.'));
        const cleanFilename = filename.replace(/_v\d+/i, '').replace(/_V\d+/i, '').replace(/\s+/g, '').toLowerCase();
        
        // Remove braces contents from cleanName for fallback mapping if URL is base character
        const cleanNameNoBraces = cleanName.replace(/\(.*\)/g, '');
        if (cleanFilename === cleanName || (cleanName.includes('(') && cleanFilename === cleanNameNoBraces)) {
          return url;
        }
      } catch (e) {
        // Skip malformed URL components
      }
    }
    
    return '';
  }
});

// Copy button functionality helper
window.copyCode = function(elementId) {
  const codeEl = document.getElementById(elementId);
  if (!codeEl) return;
  
  const text = codeEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const oldText = btn.textContent;
    btn.textContent = 'コピー完了！';
    btn.style.borderColor = 'var(--success)';
    btn.style.color = 'var(--success)';
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }).catch(err => {
    alert('コピーに失敗しました。手動で選択してコピーしてください。');
  });
};
