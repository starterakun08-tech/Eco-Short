// ============================================================
//  EcoSort IoT Dashboard — Charts Module
//  1. Revenue Spline: Riwayat Berat Sensor (Dashboard)
//  2. Customers Donut: Kapasitas Sampah (Dashboard) — 2 Bagian Murni
//  3. Analytics Weight Chart: Riwayat Berat per Jam (Analitik)
//  4. Analytics Capacity Chart: Tingkat Isi dari Waktu ke Waktu (Analitik)
// ============================================================

let revenueChartInstance = null;
let donutChartInstance = null;
let analyticsWeightChartInstance = null;
let analyticsCapacityChartInstance = null;
let sideSensorChartInstance = null;

window.revenueChartInstance = null;
window.donutChartInstance = null;
window.analyticsWeightChartInstance = null;
window.analyticsCapacityChartInstance = null;
window.sideSensorChartInstance = null;

const COLOR_GREEN = '#74c718';
const COLOR_ORANGE = '#fbbf24';
const COLOR_EMPTY_GRAY = '#e2e8f0';

// ---- 1. Inisialisasi Revenue Spline Chart (Dashboard) ----
function initRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(116, 199, 24, 0.22)');
  grad.addColorStop(1, 'rgba(116, 199, 24, 0.00)');

  window.revenueChartInstance = revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Hari ini',
          data: [],
          borderColor: COLOR_GREEN,
          backgroundColor: grad,
          borderWidth: 3.5,
          tension: 0.45,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: COLOR_GREEN,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 6, right: 6, top: 4, bottom: 2 }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#1f2d24',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return (context.parsed.y || 0).toFixed(1) + ' g';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
            autoSkip: true,
            maxTicksLimit: 7
          },
          border: { display: false }
        },
        y: {
          min: 0,
          suggestedMax: 100,
          ticks: {
            maxTicksLimit: 6,
            callback: function(val) {
              if (val === 0) return '0';
              if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
              return val + 'g';
            },
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
          },
          grid: {
            color: '#f1f5f9',
            borderDash: [3, 3],
            drawBorder: false
          },
          border: { display: false }
        }
      }
    }
  });

  // Awal tanpa data -> tampilkan watermark "Belum ada data", sembunyikan floating badge
  const emptyEl = document.getElementById('revenueEmptyState');
  if (emptyEl) emptyEl.style.display = 'flex';
  const badge = document.getElementById('chartFloatingBadge');
  if (badge) badge.style.display = 'none';
  const bar = document.getElementById('chartFloatingBar');
  if (bar) bar.style.display = 'none';
}

// ---- 2. Inisialisasi Donut Chart (Kapasitas Sampah — Tepat 2 Segmen) ----
function initDonutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  window.donutChartInstance = donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Tidak ada data'],
      datasets: [
        {
          data: [100],
          backgroundColor: [COLOR_EMPTY_GRAY],
          borderWidth: 0,
          hoverOffset: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

// ---- 3. Inisialisasi Grafik Analitik: Berat per Jam ----
function initAnalyticsWeightChart() {
  const canvas = document.getElementById('chartAnalyticsWeight');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, 'rgba(116, 199, 24, 0.25)');
  grad.addColorStop(1, 'rgba(116, 199, 24, 0.00)');

  window.analyticsWeightChartInstance = analyticsWeightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Hari ini',
          data: [],
          borderColor: COLOR_GREEN,
          backgroundColor: grad,
          borderWidth: 3,
          tension: 0.3,
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: COLOR_GREEN,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2d24',
          usePointStyle: true,
          boxWidth: 7,
          boxHeight: 7,
          boxPadding: 4,
          callbacks: {
            labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
            labelColor: () => ({ borderColor: COLOR_GREEN, backgroundColor: COLOR_GREEN, borderWidth: 0 }),
            label: (ctx) => {
              const val = ctx.parsed.y ?? 0;
              return val >= 1000 ? ` ${(val / 1000).toFixed(2)} kg` : ` ${val} g`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#a0aec0', maxTicksLimit: 6, font: { family: 'Plus Jakarta Sans', size: 10 } }
        },
        y: {
          min: 0,
          suggestedMax: 100,
          ticks: {
            maxTicksLimit: 6,
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 10 },
            callback: (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'kg' : v + 'g'
          },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });

  const emptyEl = document.getElementById('analyticsWeightEmptyState');
  if (emptyEl) emptyEl.style.display = 'flex';
}

// ---- 4. Inisialisasi Grafik Analitik: Kapasitas per Jam ----
function initAnalyticsCapacityChart() {
  const canvas = document.getElementById('chartAnalyticsCapacity');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
  grad.addColorStop(1, 'rgba(251, 191, 36, 0.00)');

  window.analyticsCapacityChartInstance = analyticsCapacityChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Kapasitas',
          data: [],
          borderColor: COLOR_ORANGE,
          backgroundColor: grad,
          borderWidth: 3,
          tension: 0.3,
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: COLOR_ORANGE,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2d24',
          usePointStyle: true,
          boxWidth: 7,
          boxHeight: 7,
          boxPadding: 4,
          callbacks: {
            labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
            labelColor: () => ({ borderColor: COLOR_ORANGE, backgroundColor: COLOR_ORANGE, borderWidth: 0 }),
            label: (ctx) => ` Kapasitas: ${ctx.parsed.y} %`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#a0aec0', maxTicksLimit: 6, font: { family: 'Plus Jakarta Sans', size: 10 } }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            maxTicksLimit: 6,
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 10 },
            callback: (v) => v + '%'
          },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });

  const emptyEl = document.getElementById('analyticsCapacityEmptyState');
  if (emptyEl) emptyEl.style.display = 'flex';
}

// ---- Update Data Riwayat Sensor (Dashboard) ----
function updateRevenueChartData(historyList, yesterdayList) {
  if (!revenueChartInstance) return;

  const emptyEl = document.getElementById('revenueEmptyState');
  const badge = document.getElementById('chartFloatingBadge');
  const bar = document.getElementById('chartFloatingBar');
  const yesterdayLegend = document.getElementById('legendYesterday');

  if (!historyList || !Array.isArray(historyList) || historyList.length === 0) {
    // Keadaan kosong jujur: sembunyikan garis datar dan tooltip menempel
    revenueChartInstance.data.labels = [];
    revenueChartInstance.data.datasets[0].data = [];
    if (revenueChartInstance.data.datasets[1]) {
      revenueChartInstance.data.datasets.pop();
    }
    revenueChartInstance.update();

    if (emptyEl) emptyEl.style.display = 'flex';
    if (badge) badge.style.display = 'none';
    if (bar) bar.style.display = 'none';
    if (yesterdayLegend) yesterdayLegend.style.display = 'none';
    return;
  }

  // Ada data sensor
  if (emptyEl) emptyEl.style.display = 'none';

  const recent = historyList.slice(-10);
  const labels = recent.map((item, idx) => {
    try {
      const d = new Date(item.t);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    } catch (_) {
      return `T${idx + 1}`;
    }
  });

  const weights = recent.map(item => Math.max(0, item.w || item.tw || 0));
  revenueChartInstance.data.labels = labels;
  revenueChartInstance.data.datasets[0].data = weights;

  // Cek apakah ada data Kemarin
  const hasYesterday = yesterdayList && Array.isArray(yesterdayList) && yesterdayList.length > 0;
  if (yesterdayLegend) {
    yesterdayLegend.style.display = hasYesterday ? 'inline-flex' : 'none';
  }

  if (hasYesterday) {
    const yWeights = yesterdayList.slice(-recent.length).map(item => Math.max(0, item.w || item.tw || 0));
    if (!revenueChartInstance.data.datasets[1]) {
      revenueChartInstance.data.datasets.push({
        label: 'Kemarin',
        data: yWeights,
        borderColor: COLOR_ORANGE,
        borderWidth: 2,
        borderDash: [4, 4],
        fill: false,
        pointRadius: 0
      });
    } else {
      revenueChartInstance.data.datasets[1].data = yWeights;
    }
  } else if (revenueChartInstance.data.datasets[1]) {
    revenueChartInstance.data.datasets.pop();
  }

  const maxW = Math.max(...weights, 50);
  revenueChartInstance.options.scales.y.suggestedMax = Math.ceil(maxW * 1.15);
  revenueChartInstance.update();

  // Floating badge di titik puncak
  const peakWeight = Math.max(...weights, 0);
  if (badge && peakWeight > 0) {
    badge.style.display = 'block';
    if (bar) bar.style.display = 'block';
    if (peakWeight >= 1000) {
      badge.textContent = (peakWeight / 1000).toFixed(1) + ' kg';
    } else {
      badge.textContent = peakWeight.toFixed(1) + ' g';
    }
  } else {
    if (badge) badge.style.display = 'none';
    if (bar) bar.style.display = 'none';
  }
}

// ---- Update Donut Chart Persentase Kapasitas (Hanya 2 Segmen Murni) ----
function updateDonutChartData(fillPercent) {
  if (!donutChartInstance) return;

  const centerText = document.getElementById('valFill');
  const capText = document.getElementById('profileCapacityText');
  const capFill = document.getElementById('profileCapacityFill');

  // Keadaan offline atau tidak ada data: Cincin abu-abu netral, teks "--"
  if (fillPercent === null || fillPercent === undefined || isNaN(fillPercent)) {
    donutChartInstance.data.labels = ['Tidak ada data'];
    donutChartInstance.data.datasets[0].data = [100];
    donutChartInstance.data.datasets[0].backgroundColor = [COLOR_EMPTY_GRAY];
    donutChartInstance.update();

    if (centerText) centerText.textContent = '--';
    if (capText) capText.textContent = '--';
    if (capFill) capFill.style.width = '0%';
    return;
  }

  // Keadaan online & data valid: TEPAT 2 SEGMEN (Terisi & Kosong) yang berjumlah 100%
  const validPercent = Math.min(100, Math.max(0, Math.round(fillPercent)));
  const segmentTerisi = validPercent;
  const segmentKosong = Math.max(0, 100 - validPercent);

  donutChartInstance.data.labels = ['Terisi', 'Kosong'];
  donutChartInstance.data.datasets[0].data = [segmentTerisi, segmentKosong];
  donutChartInstance.data.datasets[0].backgroundColor = [COLOR_GREEN, COLOR_ORANGE];
  donutChartInstance.update();

  if (centerText) centerText.textContent = validPercent + '%';
  if (capText) capText.textContent = validPercent + '%';
  if (capFill) capFill.style.width = validPercent + '%';
}

// ---- Update Grafik di Halaman Analitik ----
function updateAnalyticsCharts(labelsOrObj, todayWeights, todayCapacities, yesterdayWeights, hasYesterday) {
  let labels = labelsOrObj;
  let tW = todayWeights;
  let tC = todayCapacities;
  let yW = yesterdayWeights;
  let hasY = hasYesterday;

  if (labelsOrObj && typeof labelsOrObj === 'object' && !Array.isArray(labelsOrObj)) {
    labels = labelsOrObj.labels;
    tW = labelsOrObj.todayWeights;
    tC = labelsOrObj.todayCapacities;
    yW = labelsOrObj.yesterdayWeights;
    hasY = labelsOrObj.hasYesterdayData;
  }

  const emptyW = document.getElementById('analyticsWeightEmptyState');
  const emptyC = document.getElementById('analyticsCapacityEmptyState');

  const validWeights = (tW || []).filter(w => w !== null && !isNaN(w));
  const validCapacities = (tC || []).filter(c => c !== null && !isNaN(c));

  if (analyticsWeightChartInstance) {
    if (validWeights.length === 0) {
      analyticsWeightChartInstance.data.labels = [];
      analyticsWeightChartInstance.data.datasets[0].data = [];
      if (analyticsWeightChartInstance.data.datasets[1]) {
        analyticsWeightChartInstance.data.datasets.pop();
      }
      analyticsWeightChartInstance.update();
      if (emptyW) emptyW.style.display = 'flex';
    } else {
      if (emptyW) emptyW.style.display = 'none';
      analyticsWeightChartInstance.data.labels = labels;
      analyticsWeightChartInstance.data.datasets[0].data = tW || [];
      const maxVal = Math.max(...validWeights, 50);
      analyticsWeightChartInstance.options.scales.y.suggestedMax = Math.ceil(maxVal * 1.15);

      if (hasY && yW && yW.length > 0) {
        if (!analyticsWeightChartInstance.data.datasets[1]) {
          analyticsWeightChartInstance.data.datasets.push({
            label: 'Kemarin',
            data: yW,
            borderColor: COLOR_ORANGE,
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            pointRadius: 0
          });
        } else {
          analyticsWeightChartInstance.data.datasets[1].data = yW;
        }
      } else if (analyticsWeightChartInstance.data.datasets[1]) {
        analyticsWeightChartInstance.data.datasets.pop();
      }
      analyticsWeightChartInstance.update();
    }
  }

  if (analyticsCapacityChartInstance) {
    if (validCapacities.length === 0) {
      analyticsCapacityChartInstance.data.labels = [];
      analyticsCapacityChartInstance.data.datasets[0].data = [];
      analyticsCapacityChartInstance.update();
      if (emptyC) emptyC.style.display = 'flex';
    } else {
      if (emptyC) emptyC.style.display = 'none';
      analyticsCapacityChartInstance.data.labels = labels;
      analyticsCapacityChartInstance.data.datasets[0].data = tC || [];
      analyticsCapacityChartInstance.update();
    }
  }

  const yLegend = document.getElementById('legendAnalyticsYesterday');
  if (yLegend) {
    yLegend.style.display = hasY ? 'inline-flex' : 'none';
  }
}

// ---- 5. Inisialisasi Grafik Sensor Samping: Berat & Kapasitas (Sidebar Kanan) ----
function initSideSensorChart() {
  const canvas = document.getElementById('sideSensorChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const gradGreen = ctx.createLinearGradient(0, 0, 0, 140);
  gradGreen.addColorStop(0, 'rgba(114, 192, 26, 0.35)');
  gradGreen.addColorStop(1, 'rgba(114, 192, 26, 0.00)');

  window.sideSensorChartInstance = sideSensorChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Berat Sampah',
          data: [],
          borderColor: '#72c01a',
          backgroundColor: gradGreen,
          pointBackgroundColor: '#72c01a',
          pointBorderColor: '#72c01a',
          pointStyle: 'circle',
          borderWidth: 2,
          tension: 0,
          cubicInterpolationMode: 'default',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          hoverRadius: 5,
          spanGaps: true,
          yAxisID: 'y'
        },
        {
          label: 'Kapasitas',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#f59e0b',
          pointStyle: 'circle',
          borderWidth: 2,
          borderDash: [3, 3],
          tension: 0,
          cubicInterpolationMode: 'default',
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 5,
          hoverRadius: 5,
          spanGaps: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          usePointStyle: true,
          boxWidth: 7,
          boxHeight: 7,
          boxPadding: 5,
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#f8fafc',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          titleFont: { family: 'Plus Jakarta Sans', size: 11, weight: '700' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 10, weight: '500' },
          callbacks: {
            labelPointStyle: function() {
              return { pointStyle: 'circle', rotation: 0 };
            },
            labelColor: function(ctx) {
              const color = ctx.datasetIndex === 0 ? '#72c01a' : '#f59e0b';
              return { borderColor: color, backgroundColor: color, borderWidth: 0 };
            },
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                const val = ctx.parsed.y ?? 0;
                const labelVal = val >= 1000 ? `${(val / 1000).toFixed(2)} kg` : `${val.toFixed(1)} g`;
                return ` Berat: ${labelVal}`;
              }
              return ` Kapasitas: ${ctx.parsed.y}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', maxTicksLimit: 6, font: { family: 'Plus Jakarta Sans', size: 9 } }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: 0,
          suggestedMax: 50,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#72c01a',
            font: { family: 'Plus Jakarta Sans', size: 9 },
            maxTicksLimit: 5,
            callback: (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'kg' : v + 'g'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#f59e0b',
            font: { family: 'Plus Jakarta Sans', size: 9 },
            stepSize: 25,
            maxTicksLimit: 5,
            callback: (v) => v + '%'
          }
        }
      }
    }
  });

  const emptyEl = document.getElementById('sideChartEmptyState');
  if (emptyEl) emptyEl.style.display = 'flex';
}

function updateSideSensorChart(historyList, liveWeight, liveDistance) {
  if (!sideSensorChartInstance) return;

  const emptyEl = document.getElementById('sideChartEmptyState');
  const liveWLabel = document.getElementById('sideLiveWeightLabel');
  const liveCLabel = document.getElementById('sideLiveCapLabel');

  const curW = Number(liveWeight ?? 0);
  const curFill = Math.min(100, Math.max(0, Math.round((curW / 10000) * 100)));

  if (liveWLabel) {
    liveWLabel.textContent = curW >= 1000 ? `${(curW / 1000).toFixed(2)} kg` : `${curW.toFixed(1)} g`;
  }
  if (liveCLabel) {
    liveCLabel.textContent = `${curFill}%`;
  }

  if (!historyList || !Array.isArray(historyList) || historyList.length === 0) {
    if (curW > 0) {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      sideSensorChartInstance.data.labels = [nowStr];
      sideSensorChartInstance.data.datasets[0].data = [curW];
      sideSensorChartInstance.data.datasets[1].data = [curFill];
      sideSensorChartInstance.options.scales.y.suggestedMax = Math.max(50, Math.ceil(curW * 1.25));
      sideSensorChartInstance.update('none');
      if (emptyEl) emptyEl.style.display = 'none';
      return;
    }

    sideSensorChartInstance.data.labels = [];
    sideSensorChartInstance.data.datasets[0].data = [];
    sideSensorChartInstance.data.datasets[1].data = [];
    sideSensorChartInstance.update('none');
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  const recent = historyList.slice(-14);
  const labels = recent.map((item, idx) => {
    try {
      const d = new Date(item.t);
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${m}:${s}`;
    } catch (_) {
      return `T${idx + 1}`;
    }
  });

  const weights = recent.map(item => Number((item.w ?? item.tw ?? 0).toFixed(1)));
  const capacities = recent.map(item => {
    const w = Number(item.w ?? item.tw ?? 0);
    return Math.min(100, Math.max(0, Math.round((w / 10000) * 100)));
  });

  sideSensorChartInstance.data.labels = labels;
  sideSensorChartInstance.data.datasets[0].data = weights;
  sideSensorChartInstance.data.datasets[1].data = capacities;

  // Skala stabil: Pertahankan minimum 50g agar sumbu Y tidak melompat-lompat setiap 2 detik
  const maxW = Math.max(...weights, curW, 50);
  sideSensorChartInstance.options.scales.y.suggestedMax = Math.ceil(maxW / 25) * 25;
  sideSensorChartInstance.update('none');
}

// ---- Resize Semua Grafik Saat Layar Berubah ----
function resizeAllCharts() {
  if (revenueChartInstance) revenueChartInstance.resize();
  if (donutChartInstance) donutChartInstance.resize();
  if (analyticsWeightChartInstance) analyticsWeightChartInstance.resize();
  if (analyticsCapacityChartInstance) analyticsCapacityChartInstance.resize();
  if (sideSensorChartInstance) sideSensorChartInstance.resize();
}

function setupChartResponsiveness() {
  window.addEventListener('resize', resizeAllCharts);
  window.addEventListener('orientationchange', () => {
    setTimeout(resizeAllCharts, 150);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initRevenueChart();
  initDonutChart();
  initAnalyticsWeightChart();
  initAnalyticsCapacityChart();
  initSideSensorChart();
  setupChartResponsiveness();
});
