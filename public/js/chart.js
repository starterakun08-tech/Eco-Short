// ============================================================
//  Creativilo / EcoSort IoT Dashboard — Charts Module
//  Revenue Spline Chart + Customers Donut Chart
//  Responsif di semua ukuran layar (ResizeObserver & debounced resize)
// ============================================================

let revenueChartInstance = null;
let donutChartInstance = null;

const COLOR_GREEN = '#74c718';
const COLOR_ORANGE = '#fbbf24';
const COLOR_DARK = '#2d3748';

// ---- Inisialisasi Revenue Spline Chart ----
function initRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Gradient halus di bawah kurva (sangat tipis seperti di gambar)
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, 'rgba(116, 199, 24, 0.12)');
  grad.addColorStop(1, 'rgba(116, 199, 24, 0.00)');

  // Default mockup data matching design
  const defaultLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const defaultData = [18, 14, 25, 42, 28, 38, 26];

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: defaultLabels,
      datasets: [
        {
          label: 'This week',
          data: defaultData,
          borderColor: COLOR_GREEN,
          backgroundColor: grad,
          borderWidth: 3,
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
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#1f2d24',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          titleFont: { family: 'Plus Jakarta Sans', size: 11, weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 11 },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return (context.parsed.y * 10).toFixed(1) + ' g';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '500' },
            autoSkip: true,
            maxTicksLimit: 7
          },
          border: { display: false }
        },
        y: {
          min: 0,
          max: 50,
          ticks: {
            stepSize: 10,
            callback: function(val) {
              if (val === 0) return '0';
              return val + 'k';
            },
            color: '#a0aec0',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '500' }
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

// ---- Inisialisasi Customers Donut Chart ----
function initDonutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Default matching screenshot: 3 segments (Orange ~55%, Green ~30%, Dark ~15%)
  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['New Customers', 'Current Customers', 'Inactive'],
      datasets: [
        {
          data: [55, 30, 15],
          backgroundColor: [COLOR_ORANGE, COLOR_GREEN, COLOR_DARK],
          borderWidth: 0,
          hoverOffset: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '76%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

// ---- Update Data Revenue Chart dari Riwayat Telemetri ESP32 ----
function updateRevenueChartData(historyList) {
  if (!revenueChartInstance) return;

  if (!historyList || historyList.length === 0) return;

  // Ambil 7 titik data terakhir atau agregat per jam/hari
  const recent = historyList.slice(-7);
  const labels = recent.map((item, idx) => {
    try {
      const d = new Date(item.t);
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || `T${idx+1}`;
    } catch (_) {
      return `T${idx+1}`;
    }
  });

  // Normalisasi data berat agar proporsional ke grafik 0-50k
  const weights = recent.map(item => Math.max(0, item.w || item.tw || 0));
  const maxW = Math.max(...weights, 100);

  const scaled = weights.map(w => Math.round((w / maxW) * 45) + 5);

  revenueChartInstance.data.labels = labels;
  revenueChartInstance.data.datasets[0].data = scaled;
  revenueChartInstance.update();

  // Update floating badge nilai puncak
  const badge = document.getElementById('chartFloatingBadge');
  if (badge && weights.length > 0) {
    const peakWeight = Math.max(...weights);
    if (peakWeight > 1000) {
      badge.textContent = '$' + (peakWeight / 1000).toFixed(1) + 'k';
    } else {
      badge.textContent = '$' + peakWeight.toFixed(1);
    }
  }
}

// ---- Update Donut Chart Berdasarkan Persentase Isi Tong ----
function updateDonutChartData(fillPercent) {
  if (!donutChartInstance) return;

  const validPercent = Math.min(100, Math.max(0, Math.round(fillPercent)));

  // Bagi ke proporsi estetis matching screenshot
  const segment1 = validPercent; // Terisi
  const segment2 = Math.max(0, 100 - validPercent); // Kosong
  const segment3 = 12; // Aksen gelap estetis

  donutChartInstance.data.datasets[0].data = [segment2, segment1, segment3];
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
      // Sesuaikan maxTicksLimit di layar kecil agar label tidak bertumpuk
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
    setTimeout(resizeCharts, 150);
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
