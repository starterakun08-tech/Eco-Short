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
    if (latestResult == null) return const Color(0xFF16A34A);
    if (latestResult!.violatorDetected) return const Color(0xFFDC2626);
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
    final isViolator = latestResult?.violatorDetected == true;
    final isAlert = latestResult?.alertSent == true || count > 5 || isViolator;

    return Stack(
      children: [
        // 1. ZONA DETEKSI RETICLE 2 METER (Tengah Layar)
        Center(
          child: IgnorePointer(
            child: LayoutBuilder(
              builder: (ctx, constraints) {
                final double boxSize = (constraints.maxWidth * 0.72).clamp(220.0, 320.0);
                return SizedBox(
                  width: boxSize,
                  height: boxSize,
                  child: Stack(
                    children: [
                      // Sudut 4 sisi frame kamera target
                      Positioned(
                        top: 0,
                        left: 0,
                        child: _buildCorner(top: true, left: true, color: statusColor),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: _buildCorner(top: true, left: false, color: statusColor),
                      ),
                      Positioned(
                        bottom: 0,
                        left: 0,
                        child: _buildCorner(top: false, left: true, color: statusColor),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: _buildCorner(top: false, left: false, color: statusColor),
                      ),
                      // Titik fokus tengah reticle
                      Center(
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: statusColor.withOpacity(0.55),
                          ),
                        ),
                      ),
                      // Label Zona Deteksi di bawah reticle
                      Positioned(
                        bottom: 8,
                        left: 0,
                        right: 0,
                        child: Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.65),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: statusColor.withOpacity(0.4), width: 1),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.crop_free, size: 11, color: statusColor),
                                const SizedBox(width: 4),
                                const Text(
                                  'ZONA DETEKSI 2 METER',
                                  style: TextStyle(
                                    color: Colors.white70,
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),

        // 2. HASIL ANALISIS & PERINGATAN (Mengalir ke bawah tanpa tumpang tindih)
        Positioned(
          top: 64,
          left: 12,
          right: 12,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Loading Pill saat sedang upload/menganalisis
              if (isAnalyzing) ...[
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.greenAccent.withOpacity(0.6)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.greenAccent),
                      ),
                      SizedBox(width: 8),
                      Text(
                        'Mengirim snapshot ke Server & Web...',
                        style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ],

              // Card Hasil Analisis Terakhir (hanya jika sudah pernah ada analisis)
              if (latestResult != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A).withOpacity(0.92),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: statusColor, width: 1.5),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.4),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: statusColor.withOpacity(0.2),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              isViolator
                                  ? Icons.person_off_rounded
                                  : (count == 0
                                      ? Icons.check_circle
                                      : (count <= 5 ? Icons.warning_amber_rounded : Icons.report_problem)),
                              color: statusColor,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  isViolator
                                      ? '🚨 PELANGGARAN: BUANG SEMBARANGAN'
                                      : (count == 0
                                          ? 'LINGKUNGAN BERSIH'
                                          : (count <= 5
                                              ? 'WASPADA: TERDETEKSI SAMPAH'
                                              : 'KOTOR: SAMPAH BERSERAKAN!')),
                                  style: TextStyle(
                                    color: statusColor,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12.5,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  isViolator
                                      ? (latestResult!.violatorDescription ?? 'Seseorang membuang sampah di luar tempat sampah!')
                                      : '$count Objek Sampah Terdeteksi (Radius ≤ 2m)',
                                  style: TextStyle(
                                    color: isViolator ? Colors.red.shade200 : Colors.white70,
                                    fontSize: 11,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.white10,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'LIVE WEB',
                              style: TextStyle(
                                color: Colors.greenAccent,
                                fontSize: 9.5,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      // Tampilkan daftar jenis sampah jika ada
                      if (latestResult!.trashItems.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: latestResult!.trashItems.map((item) {
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white12,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                item,
                                style: const TextStyle(color: Colors.white, fontSize: 10),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              ],

              // Alert Darurat Petugas Kebersihan (> 5 sampah)
              if (latestResult != null && isAlert) ...[
                const SizedBox(height: 6),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7F1D1D).withOpacity(0.92),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.redAccent, width: 1.2),
                  ),
                  child: Row(
                    children: const [
                      Icon(Icons.notifications_active, color: Colors.yellowAccent, size: 16),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Peringatan otomatis diteruskan ke Petugas Kebersihan!',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10.5,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCorner({required bool top, required bool left, required Color color}) {
    const double length = 22;
    const double thickness = 2.5;

    return SizedBox(
      width: length,
      height: length,
      child: CustomPaint(
        painter: _CornerPainter(top: top, left: left, color: color, thickness: thickness),
      ),
    );
  }
}

class _CornerPainter extends CustomPainter {
  final bool top;
  final bool left;
  final Color color;
  final double thickness;

  _CornerPainter({required this.top, required this.left, required this.color, required this.thickness});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final path = Path();
    if (top && left) {
      path.moveTo(0, size.height);
      path.lineTo(0, 0);
      path.lineTo(size.width, 0);
    } else if (top && !left) {
      path.moveTo(0, 0);
      path.lineTo(size.width, 0);
      path.lineTo(size.width, size.height);
    } else if (!top && left) {
      path.moveTo(0, 0);
      path.lineTo(0, size.height);
      path.lineTo(size.width, size.height);
    } else {
      path.moveTo(size.width, 0);
      path.lineTo(size.width, size.height);
      path.lineTo(0, size.height);
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
