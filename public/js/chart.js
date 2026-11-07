// ============================================================
//  EcoSort IoT Dashboard — Charts Module
//  Revenue Spline (Riwayat Berat Sensor) + Customers Donut (Kapasitas Tong)
//  Responsif di semua ukuran layar (ResizeObserver & debounced resize)
// ============================================================

let revenueChartInstance = null;
let donutChartInstance = null;
window.revenueChartInstance = null;
window.donutChartInstance = null;

const COLOR_GREEN = '#74c718';
const COLOR_ORANGE = '#fbbf24';
const COLOR_DARK = '#27372c';

// ---- Inisialisasi Revenue Spline Chart (Riwayat Berat) ----
function initRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(116, 199, 24, 0.16)');
  grad.addColorStop(1, 'rgba(116, 199, 24, 0.00)');

  const defaultLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
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
              return context.parsed.y.toFixed(1) + ' g';
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
            stepSize: 20,
            callback: function(val) {
              if (val === 0) return '0';
              if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
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

// ---- Inisialisasi Customers Donut Chart (Kapasitas Tong) ----
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

// ---- Update Data Riwayat Sensor ----
function updateRevenueChartData(historyList) {
  if (!revenueChartInstance) return;
  if (!historyList || historyList.length === 0) return;

  const recent = historyList.slice(-7);
  const labels = recent.map((item, idx) => {
    try {
      const d = new Date(item.t);
      return ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()] || `T${idx+1}`;
    } catch (_) {
      return `T${idx+1}`;
    }
  });

  const weights = recent.map(item => Math.max(0, item.w || item.tw || 0));
  revenueChartInstance.data.labels = labels;
  revenueChartInstance.data.datasets[0].data = weights;

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

// ---- Resize Observer & Orientation Watcher ----
function setupChartResponsiveness() {
  const resizeCharts = () => {
    if (revenueChartInstance) {
      if (window.innerWidth < 480) {
        revenueChartInstance.options.scales.x.ticks.maxTicksLimit = 4;
      } else {
        revenueChartInstance.options.scales.x.ticks.maxTicksLimit = 7;
      }
      revenueChartInstance.resize();
    }
    if (donutChartInstance) {
      donutChartInstance.resize();
    }
  };

  window.addEventListener('resize', resizeCharts);
  window.addEventListener('orientationchange', () => {
    setTimeout(resizeCharts, 120);
  });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      resizeCharts();
    });
    const rw = document.querySelector('.revenue-chart-wrap');
    const dw = document.querySelector('.donut-center-wrap');
    if (rw) ro.observe(rw);
    if (dw) ro.observe(dw);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initRevenueChart();
  initDonutChart();
  setupChartResponsiveness();
});
