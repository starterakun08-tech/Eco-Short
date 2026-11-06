// ============================================================
//  EcoSort IoT Dashboard — Chart Module
//  Tema: Putih Bersih
//  Tertinggi: #546B41
//  Rendah / Terendah: #99AD7A
// ============================================================

let sensorChart = null;

const COLOR_HIGH = '#546B41';
const COLOR_LOW = '#99AD7A';

function initChart() {
  const ctx = document.getElementById('sensorChart');
  if (!ctx) return;

  sensorChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Berat Sensor (g)',
          data: [],
          borderColor: COLOR_HIGH,
          backgroundColor: 'rgba(84, 107, 65, 0.16)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: COLOR_HIGH,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
          yAxisID: 'yWeight'
        },
        {
          label: 'Jarak Sensor (cm)',
          data: [],
          borderColor: COLOR_LOW,
          backgroundColor: 'rgba(153, 173, 122, 0.15)',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: COLOR_LOW,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
          yAxisID: 'yDist'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false // Menggunakan legend kustom yang bersih
        },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#e2e8f0',
          borderWidth: 1.5,
          titleColor: '#1e293b',
          bodyColor: '#475569',
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          titleFont: { family: 'Inter', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          shadowBlur: 12,
          shadowColor: 'rgba(0, 0, 0, 0.08)'
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 10, weight: '500' },
            maxTicksLimit: 8
          },
          grid: {
            color: '#f1f5f9',
            drawBorder: false
          }
        },
        yWeight: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Berat (g)',
            color: COLOR_HIGH,
            font: { family: 'Inter', size: 11, weight: '700' }
          },
          ticks: {
            color: COLOR_HIGH,
            font: { family: 'Inter', size: 10, weight: '600' }
          },
          grid: {
            color: '#f1f5f9',
            drawBorder: false
          },
          beginAtZero: true
        },
        yDist: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Jarak (cm)',
            color: '#64748b',
            font: { family: 'Inter', size: 11, weight: '700' }
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 10, weight: '500' }
          },
          grid: {
            drawOnChartArea: false,
            drawBorder: false
          },
          beginAtZero: true
        }
      },
      animation: {
        duration: 300
      }
    }
  });
}

function updateChart(history) {
  if (!sensorChart || !history || history.length === 0) return;

  const labels = history.map(h => {
    const d = new Date(h.t);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const weights = history.map(h => h.w ?? 0);
  const distances = history.map(h => h.d ?? null);

  sensorChart.data.labels = labels;
  sensorChart.data.datasets[0].data = weights;
  sensorChart.data.datasets[1].data = distances;
  sensorChart.update('none'); // Update cepat tanpa flickering
}

// Inisialisasi grafik saat DOM siap
document.addEventListener('DOMContentLoaded', initChart);
