import 'dart:async';
import 'dart:convert';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../models/cctv_result.dart';
import '../services/api_service.dart';
import '../widgets/cctv_hud_overlay.dart';
import 'settings_screen.dart';

class CameraScreen extends StatefulWidget {
  final List<CameraDescription> cameras;

  const CameraScreen({Key? key, required this.cameras}) : super(key: key);

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  int _selectedCameraIdx = 0;
  bool _isAnalyzing = false;
  bool _autoCaptureEnabled = false;
  int _autoIntervalSeconds = 10;
  Timer? _autoTimer;
  CctvAnalysisResult? _latestResult;
  bool _isTorchOn = false;
  bool? _isServerConnected;
  String _serverUrl = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSettings();
    _initCamera(_selectedCameraIdx);
  }

  Future<void> _loadSettings() async {
    final interval = await ApiService.getAutoCaptureInterval();
    final url = await ApiService.getServerUrl();
    final ok = await ApiService.pingServer();
    if (!mounted) return;
    setState(() {
      _autoIntervalSeconds = interval;
      _serverUrl = url;
      _isServerConnected = ok;
    });

    // Jika belum terhubung saat pertama buka app, beri tahu user dengan tombol atur IP
    if (!ok && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('⚠️ Belum terhubung ke $url. Sambungkan ke IP laptop Anda.'),
            backgroundColor: const Color(0xFFD97706),
            duration: const Duration(seconds: 6),
            action: SnackBarAction(
              label: 'Atur IP',
              textColor: Colors.white,
              onPressed: _showQuickConnectionDialog,
            ),
          ),
        );
      });
    }
  }

  void _showQuickConnectionDialog() {
    final ctrl = TextEditingController(text: _serverUrl);
    bool isTesting = false;
    String? testMsg;
    bool? testOk;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: const [
              Icon(Icons.wifi_tethering, color: Colors.greenAccent, size: 22),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Sambungkan ke Analisis CCTV',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Masukkan alamat URL Server Dashboard tempat EcoSort berjalan:',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: ctrl,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    labelText: 'URL Server Dashboard',
                    labelStyle: const TextStyle(color: Colors.greenAccent),
                    hintText: 'http://192.168.100.16:40122',
                    hintStyle: const TextStyle(color: Colors.white30),
                    prefixIcon: const Icon(Icons.link, color: Colors.greenAccent, size: 20),
                    filled: true,
                    fillColor: Colors.black26,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 10),
                const Text('Pilihan Cepat:', style: TextStyle(color: Colors.white54, fontSize: 11)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ActionChip(
                      backgroundColor: Colors.white12,
                      label: const Text('IP Laptop (192.168.100.16:40122)', style: TextStyle(color: Colors.white, fontSize: 11)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = 'http://192.168.100.16:40122';
                        });
                      },
                    ),
                    ActionChip(
                      backgroundColor: Colors.white12,
                      label: const Text('Emulator (10.0.2.2:40122)', style: TextStyle(color: Colors.white, fontSize: 11)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = 'http://10.0.2.2:40122';
                        });
                      },
                    ),
                  ],
                ),
                if (testMsg != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: testOk == true ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: testOk == true ? Colors.greenAccent : Colors.redAccent),
                    ),
                    child: Row(
                      children: [
                        Icon(testOk == true ? Icons.check_circle : Icons.error, color: testOk == true ? Colors.greenAccent : Colors.redAccent, size: 16),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            testMsg!,
                            style: TextStyle(color: testOk == true ? Colors.greenAccent : Colors.redAccent, fontSize: 11),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: isTesting ? null : () => Navigator.pop(ctx),
              child: const Text('Tutup', style: TextStyle(color: Colors.white60)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
              onPressed: isTesting
                  ? null
                  : () async {
                      setDialogState(() {
                        isTesting = true;
                        testMsg = 'Menguji koneksi ke server...';
                        testOk = null;
                      });

                      final trimmedUrl = ctrl.text.trim();
                      await ApiService.setServerUrl(trimmedUrl);
                      final ok = await ApiService.pingServer();

                      setDialogState(() {
                        isTesting = false;
                        testOk = ok;
                        testMsg = ok
                            ? 'Berhasil terhubung ke Dashboard EcoSort!'
                            : 'Gagal terhubung. Pastikan laptop & HP di satu WiFi dan server aktif.';
                      });

                      if (ok) {
                        setState(() {
                          _serverUrl = trimmedUrl;
                          _isServerConnected = true;
                        });
                        Future.delayed(const Duration(milliseconds: 900), () {
                          if (Navigator.canPop(ctx)) Navigator.pop(ctx);
                        });
                      }
                    },
              child: isTesting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Tes & Sambungkan', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _initCamera(int cameraIdx) async {
    if (widget.cameras.isEmpty) return;

    if (_controller != null) {
      await _controller!.dispose();
    }

    final camera = widget.cameras[cameraIdx];
    final controller = CameraController(
      camera,
      ResolutionPreset.medium,
      enableAudio: false,
    );

    try {
      await controller.initialize();
      if (!mounted) return;
      setState(() {
        _controller = controller;
        _selectedCameraIdx = cameraIdx;
        _isTorchOn = false;
      });
    } catch (e) {
      debugPrint('Error init camera: $e');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_controller == null || !_controller!.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      _controller?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initCamera(_selectedCameraIdx);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _autoTimer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  void _toggleTorch() async {
    if (_controller == null || !_controller!.value.isInitialized) return;
    try {
      final newMode = _isTorchOn ? FlashMode.off : FlashMode.torch;
      await _controller!.setFlashMode(newMode);
      setState(() {
        _isTorchOn = !_isTorchOn;
      });
    } catch (e) {
      debugPrint('Flash error: $e');
    }
  }

  void _flipCamera() {
    if (widget.cameras.length < 2) return;
    final nextIdx = (_selectedCameraIdx + 1) % widget.cameras.length;
    _initCamera(nextIdx);
  }

  void _toggleAutoCapture(bool value) {
    setState(() {
      _autoCaptureEnabled = value;
    });

    _autoTimer?.cancel();
    if (_autoCaptureEnabled) {
      _captureAndAnalyze(); // Langsung ambil frame pertama
      _autoTimer = Timer.periodic(
        Duration(seconds: _autoIntervalSeconds),
        (_) => _captureAndAnalyze(),
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Auto-Capture aktif setiap $_autoIntervalSeconds detik'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 2),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Auto-Capture dinonaktifkan'),
          duration: Duration(seconds: 1),
        ),
      );
    }
  }

  Future<void> _captureAndAnalyze() async {
    if (_controller == null || !_controller!.value.isInitialized || _isAnalyzing) {
      return;
    }

    setState(() {
      _isAnalyzing = true;
    });

    try {
      final xfile = await _controller!.takePicture();
      final bytes = await xfile.readAsBytes();
      final base64Image = base64Encode(bytes);

      final result = await ApiService.sendCctvFrame(base64Image);
      if (!mounted) return;

      setState(() {
        _latestResult = result;
      });

      // Tampilkan notifikasi jika ada alert petugas
      if (result.alertSent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.alertMessage ?? 'Peringatan terkirim ke petugas!'),
            backgroundColor: Colors.red.shade700,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error capture and analyze: $e');
      if (mounted && !_autoCaptureEnabled) {
        final isTimeout = e.toString().toLowerCase().contains('timeout');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isTimeout
                ? 'Gagal terhubung ke $_serverUrl. Pastikan HP dan laptop terhubung ke WiFi yang sama.'
                : 'Analisis gagal: $e'),
            backgroundColor: Colors.redAccent,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'Atur IP',
              textColor: Colors.white,
              onPressed: _showQuickConnectionDialog,
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              CircularProgressIndicator(color: Colors.green),
              SizedBox(height: 16),
              Text(
                'Menghubungkan ke Kamera CCTV...',
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 1. Live Camera Preview
            Center(
              child: AspectRatio(
                aspectRatio: _controller!.value.aspectRatio,
                child: CameraPreview(_controller!),
              ),
            ),

            // 2. HUD Target 2 Meter & Status Overlay
            CctvHudOverlay(
              latestResult: _latestResult,
              isAnalyzing: _isAnalyzing,
              autoCaptureEnabled: _autoCaptureEnabled,
              autoIntervalSeconds: _autoIntervalSeconds,
            ),

            // 3. Tombol Status Koneksi & Pengaturan di Pojok Kanan Atas
            Positioned(
              top: 16,
              right: 16,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: _showQuickConnectionDialog,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: _isServerConnected == true
                            ? const Color(0xFF16A34A).withOpacity(0.85)
                            : (_isServerConnected == false
                                ? const Color(0xFFD97706).withOpacity(0.9)
                                : Colors.black.withOpacity(0.65)),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _isServerConnected == true ? Colors.greenAccent : Colors.orangeAccent,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _isServerConnected == true ? Icons.cloud_done : Icons.cloud_off,
                            color: Colors.white,
                            size: 14,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            _isServerConnected == true ? 'Terhubung' : 'Atur Server',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.65),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.settings, color: Colors.white, size: 20),
                      onPressed: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const SettingsScreen()),
                        );
                        _loadSettings();
                      },
                    ),
                  ),
                ],
              ),
            ),

            // 4. Panel Kontrol Bawah
            Positioned(
              bottom: 24,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.82),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.white.withOpacity(0.12)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    // Flashlight Toggle
                    IconButton(
                      icon: Icon(
                        _isTorchOn ? Icons.flash_on : Icons.flash_off,
                        color: _isTorchOn ? Colors.yellow : Colors.white70,
                      ),
                      onPressed: _toggleTorch,
                      tooltip: 'Senter',
                    ),

                    // Tombol Utama: Ambil & Analisa Sekarang
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16A34A),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 22,
                          vertical: 12,
                        ),
                      ),
                      onPressed: _isAnalyzing ? null : _captureAndAnalyze,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _isAnalyzing
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.camera_alt, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            _isAnalyzing ? 'Menganalisis...' : 'Analisis CCTV',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),

                    // Kamera Flip
                    IconButton(
                      icon: const Icon(Icons.flip_camera_ios, color: Colors.white70),
                      onPressed: _flipCamera,
                      tooltip: 'Ganti Kamera',
                    ),

                    // Auto Capture Switch
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.timer, color: Colors.white70, size: 18),
                        Switch(
                          value: _autoCaptureEnabled,
                          activeColor: Colors.greenAccent,
                          onChanged: _toggleAutoCapture,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

