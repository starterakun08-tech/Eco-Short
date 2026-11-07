// ============================================================
//  EcoSort IoT Dashboard — Charts Module
//  1. Revenue Spline: Riwayat Berat Sensor (Dashboard)
//  2. Customers Donut: Kapasitas Tong (Dashboard)
//  3. Analytics Weight Chart: Riwayat Berat per Jam (Analitik)
//  4. Analytics Capacity Chart: Tingkat Isi dari Waktu ke Waktu (Analitik)
// ============================================================

let revenueChartInstance = null;
let donutChartInstance = null;
let analyticsWeightChartInstance = null;
let analyticsCapacityChartInstance = null;

window.revenueChartInstance = null;
window.donutChartInstance = null;
window.analyticsWeightChartInstance = null;
window.analyticsCapacityChartInstance = null;

const COLOR_GREEN = '#74c718';
const COLOR_ORANGE = '#fbbf24';
const COLOR_DARK = '#27372c';

// ---- 1. Inisialisasi Revenue Spline Chart (Dashboard) ----
function initRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(116, 199, 24, 0.22)');
  grad.addColorStop(1, 'rgba(116, 199, 24, 0.00)');

  // Default jam realistis untuk hari ini
  const defaultLabels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
  const defaultData = [0, 0, 0, 0, 0, 0, 0];

  window.revenueChartInstance = revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: defaultLabels,
      datasets: [
        {
          label: 'Hari ini',
          data: defaultData,
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
}

// ---- 2. Inisialisasi Donut Chart (Kapasitas Tong) ----
function initDonutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  window.donutChartInstance = donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Kosong', 'Terisi', 'Aksen'],
      datasets: [
        {
          data: [100, 0, 5],
          backgroundColor: [COLOR_ORANGE, COLOR_GREEN, COLOR_DARK],
          borderWidth: 0,
          hoverOffset: 3
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

  const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'];
  const zeroes = [0, 0, 0, 0, 0, 0, 0];

  window.analyticsWeightChartInstance = analyticsWeightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [
        {
          label: 'Hari ini',
          data: zeroes,
          borderColor: COLOR_GREEN,
          backgroundColor: grad,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: COLOR_GREEN
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
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} g`
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
            callback: (v) => v >= 1000 ? (v/1000).toFixed(1) + 'kg' : v + 'g'
          },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// ---- 4. Inisialisasi Grafik Analitik: Kapasitas per Jam ----
function initAnalyticsCapacityChart() {
  const canvas = document.getElementById('chartAnalyticsCapacity');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
  grad.addColorStop(1, 'rgba(251, 191, 36, 0.00)');

  const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'];
  const zeroes = [0, 0, 0, 0, 0, 0, 0];

  window.analyticsCapacityChartInstance = analyticsCapacityChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [
        {
          label: 'Kapasitas',
          data: zeroes,
          borderColor: COLOR_ORANGE,
          backgroundColor: grad,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: COLOR_ORANGE
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
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} %`
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
}

// ---- Update Data Riwayat Sensor (Sumbu X Jam & Data Jujur) ----
function updateRevenueChartData(historyList, yesterdayList) {
  if (!revenueChartInstance) return;

  if (!historyList || historyList.length === 0) {
    // Keadaan kosong jujur
    revenueChartInstance.data.labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
    revenueChartInstance.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
    if (revenueChartInstance.data.datasets[1]) {
      revenueChartInstance.data.datasets.pop();
    }
    revenueChartInstance.options.scales.y.suggestedMax = 100;
    revenueChartInstance.update();

    const badge = document.getElementById('chartFloatingBadge');
    if (badge) badge.textContent = '0.0 g';
    return;
  }

  // Ambil titik data riwayat
  const recent = historyList.slice(-10);
  const labels = recent.map((item, idx) => {
    try {
      const d = new Date(item.t);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    } catch (_) {
      return `T${idx+1}`;
    }
  });

  const weights = recent.map(item => Math.max(0, item.w || item.tw || 0));
  revenueChartInstance.data.labels = labels;
  revenueChartInstance.data.datasets[0].data = weights;

  // Cek apakah ada data Kemarin
  const hasYesterday = yesterdayList && Array.isArray(yesterdayList) && yesterdayList.length > 0;
  const yesterdayLegend = document.getElementById('legendYesterday');
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

  const badge = document.getElementById('chartFloatingBadge');
  if (badge && weights.length > 0) {
    const peakWeight = Math.max(...weights);
    if (peakWeight >= 1000) {
      badge.textContent = (peakWeight / 1000).toFixed(1) + ' kg';
    } else {
      badge.textContent = peakWeight.toFixed(1) + ' g';
    }
  }
}

// ---- Update Donut Chart Persentase Kapasitas ----
function updateDonutChartData(fillPercent) {
  if (!donutChartInstance) return;

  const validPercent = Math.min(100, Math.max(0, Math.round(fillPercent)));
  const segmentTerisi = validPercent;
  const segmentKosong = Math.max(0, 100 - validPercent);
  const segmentAksen = 6;

  donutChartInstance.data.datasets[0].data = [segmentKosong, segmentTerisi, segmentAksen];
  donutChartInstance.update();

  const centerText = document.getElementById('valFill');
  if (centerText) {
    centerText.textContent = validPercent + '%';
  }
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

  if (analyticsWeightChartInstance && labels) {
    analyticsWeightChartInstance.data.labels = labels;
    analyticsWeightChartInstance.data.datasets[0].data = tW || [];
    const validWeights = (tW || []).filter(w => w !== null && !isNaN(w));
    const maxVal = validWeights.length > 0 ? Math.max(...validWeights, 50) : 100;
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

  if (analyticsCapacityChartInstance && labels) {
    analyticsCapacityChartInstance.data.labels = labels;
    analyticsCapacityChartInstance.data.datasets[0].data = tC || [];
    analyticsCapacityChartInstance.update();
  }

  const yLegend = document.getElementById('legendAnalyticsYesterday');
  if (yLegend) {
    yLegend.style.display = hasY ? 'inline-flex' : 'none';
  }
}

// ---- Resize Semua Grafik Saat Layar Berubah ----
function resizeAllCharts() {
  if (revenueChartInstance) revenueChartInstance.resize();
  if (donutChartInstance) donutChartInstance.resize();
  if (analyticsWeightChartInstance) analyticsWeightChartInstance.resize();
  if (analyticsCapacityChartInstance) analyticsCapacityChartInstance.resize();
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
  setupChartResponsiveness();
});
