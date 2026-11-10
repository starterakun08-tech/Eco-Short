import 'package:flutter/material.dart';
import '../models/cctv_result.dart';

class CctvHudOverlay extends StatelessWidget {
  final CctvAnalysisResult? latestResult;
  final bool isAnalyzing;
  final bool autoCaptureEnabled;
  final int autoIntervalSeconds;

  const CctvHudOverlay({
    Key? key,
    required this.latestResult,
    required this.isAnalyzing,
    required this.autoCaptureEnabled,
    required this.autoIntervalSeconds,
  }) : super(key: key);

  Color _getStatusColor() {
    if (latestResult == null) return Colors.green;
    switch (latestResult!.statusColor) {
      case 'red':
        return const Color(0xFFDC2626);
      case 'yellow':
        return const Color(0xFFD97706);
      case 'green':
      default:
        return const Color(0xFF16A34A);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor();
    final count = latestResult?.detectedTrashCount ?? 0;
    final isAlert = latestResult?.alertSent == true || count > 5;

    return Stack(
      children: [
        // 1. Lingkaran Sasaran Deteksi Radius 2 Meter
        Center(
          child: Container(
            width: MediaQuery.of(context).size.width * 0.72,
            height: MediaQuery.of(context).size.width * 0.72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: statusColor.withOpacity(0.7),
                width: 2.5,
              ),
              color: statusColor.withOpacity(0.04),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.75),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: statusColor.withOpacity(0.5)),
                  ),
                  child: const Text(
                    'Target Radius 2 Meter (Jalan raya diabaikan)',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // 2. Banner Status Pojok Kiri Atas (Live CCTV)
        Positioned(
          top: 16,
          left: 16,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.75),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Colors.redAccent,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  'CCTV ECO-SORT',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
                if (autoCaptureEnabled) ...[
                  const SizedBox(width: 6),
                  Text(
                    '• AUTO (${autoIntervalSeconds}s)',
                    style: const TextStyle(
                      color: Colors.greenAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),

        // 3. Banner Status Utama (Atas Tengah / Kanan)
        Positioned(
          top: 55,
          left: 16,
          right: 16,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [statusColor, statusColor.withOpacity(0.85)],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              children: [
                Text(
                  count == 0 ? '✅' : (count <= 5 ? '⚠️' : '🚨'),
                  style: const TextStyle(fontSize: 26),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        count == 0
                            ? 'LINGKUNGAN BERSIH'
                            : (count <= 5
                                ? 'WASPADA: TERDETEKSI SAMPAH'
                                : 'KOTOR: SAMPAH MENUMPUK!'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$count Sampah Sekitar (Radius ≤ 2m)',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isAnalyzing)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  ),
              ],
            ),
          ),
        ),

        // 4. Alert Khusus Petugas Kebersihan jika > 5 Sampah
        if (isAlert)
          Positioned(
            top: 130,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red.shade900.withOpacity(0.92),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.redAccent, width: 1.5),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.yellow, size: 20),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Peringatan Terkirim ke Petugas Kebersihan!',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

