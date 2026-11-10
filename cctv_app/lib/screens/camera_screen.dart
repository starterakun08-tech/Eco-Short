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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSettings();
    _initCamera(_selectedCameraIdx);
  }

  Future<void> _loadSettings() async {
    final interval = await ApiService.getAutoCaptureInterval();
    setState(() {
      _autoIntervalSeconds = interval;
    });
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Analisis gagal: $e'),
            backgroundColor: Colors.redAccent,
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

            // 3. Tombol Pengaturan di Pojok Kanan Atas
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.65),
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  icon: const Icon(Icons.settings, color: Colors.white, size: 22),
                  onPressed: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const SettingsScreen()),
                    );
                    _loadSettings();
                  },
                ),
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

