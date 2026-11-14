import 'dart:async';
import 'dart:convert';
import 'dart:io';
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
  bool _isCameraPowerOn = true;
  bool _autoCaptureEnabled = true; // Auto Snapshot AKTIF secara default untuk CCTV
  int _autoIntervalSeconds = 10;
  int _countdownSeconds = 10;
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
    final ok = await ApiService.pingServer(url);
    if (!mounted) return;
    setState(() {
      _autoIntervalSeconds = interval;
      _countdownSeconds = interval;
      _serverUrl = url;
      _isServerConnected = ok;
    });

    if (!ok && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('⚠️ Belum terhubung ke $url. Ketuk "Atur IP" untuk memilih server.'),
            backgroundColor: const Color(0xFFD97706),
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'Atur IP',
              textColor: Colors.white,
              onPressed: _showQuickConnectionDialog,
            ),
          ),
        );
      });
    }

    // Jika auto capture aktif, sinkronkan timer dengan interval terbaru
    if (_autoCaptureEnabled && _isCameraPowerOn && _controller != null && _controller!.value.isInitialized) {
      _startAutoCapture();
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
          titlePadding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
          contentPadding: const EdgeInsets.symmetric(horizontal: 18),
          actionsPadding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
          title: Row(
            children: const [
              Icon(Icons.wifi_tethering, color: Colors.greenAccent, size: 22),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Sambungkan ke Server CCTV',
                  style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
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
                  'Pilih tujuan server atau masukkan URL:',
                  style: TextStyle(color: Colors.white70, fontSize: 11.5),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: ctrl,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    labelText: 'URL Server Dashboard',
                    labelStyle: const TextStyle(color: Colors.greenAccent, fontSize: 12),
                    hintText: 'https://nexahome.app.hostingin.net',
                    hintStyle: const TextStyle(color: Colors.white30, fontSize: 12),
                    prefixIcon: const Icon(Icons.link, color: Colors.greenAccent, size: 18),
                    filled: true,
                    fillColor: Colors.black26,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 12),
                const Text('Pilihan Cepat Server:', style: TextStyle(color: Colors.white54, fontSize: 11)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ActionChip(
                      backgroundColor: const Color(0xFF16A34A),
                      avatar: const Icon(Icons.cloud_done, size: 14, color: Colors.white),
                      label: const Text('Domain VPS (nexahome)', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = ApiService.vpsServerUrl;
                        });
                      },
                    ),
                    ActionChip(
                      backgroundColor: Colors.white12,
                      avatar: const Icon(Icons.cloud_queue, size: 14, color: Colors.white70),
                      label: const Text('IP VPS (144.79.202.196)', style: TextStyle(color: Colors.white70, fontSize: 11)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = ApiService.ipServerUrl;
                        });
                      },
                    ),
                    ActionChip(
                      backgroundColor: Colors.white12,
                      avatar: const Icon(Icons.computer, size: 14, color: Colors.white70),
                      label: const Text('Laptop LAB RPL (192.168.109.46)', style: TextStyle(color: Colors.white70, fontSize: 11)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = ApiService.localServerUrl;
                        });
                      },
                    ),
                    ActionChip(
                      backgroundColor: Colors.white12,
                      avatar: const Icon(Icons.phone_android, size: 14, color: Colors.white70),
                      label: const Text('Emulator (10.0.2.2:40122)', style: TextStyle(color: Colors.white70, fontSize: 11)),
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
              child: const Text('Batal', style: TextStyle(color: Colors.white60)),
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

                      final trimmedUrl = ApiService.normalizeUrl(ctrl.text.trim());
                      await ApiService.setServerUrl(trimmedUrl);
                      final ok = await ApiService.pingServer(trimmedUrl);

                      setDialogState(() {
                        isTesting = false;
                        testOk = ok;
                        testMsg = ok
                            ? 'Berhasil terhubung ke Server EcoSort!'
                            : 'Gagal terhubung. Pastikan server aktif dan alamat benar.';
                      });

                      if (ok) {
                        setState(() {
                          _serverUrl = trimmedUrl;
                          _isServerConnected = true;
                        });
                        Future.delayed(const Duration(milliseconds: 700), () {
                          if (Navigator.canPop(ctx)) Navigator.pop(ctx);
                        });
                      }
                    },
              child: isTesting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Tes & Sambungkan', style: TextStyle(color: Colors.white, fontSize: 12)),
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
      // Mulai auto-capture secara otomatis begitu kamera siap
      if (_autoCaptureEnabled && _isCameraPowerOn) {
        _startAutoCapture();
      }
    } catch (e) {
      debugPrint('Error init camera: $e');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_controller == null || !_controller!.value.isInitialized) return;
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _stopAutoCapture();
      _controller?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initCamera(_selectedCameraIdx);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopAutoCapture();
    _controller?.dispose();
    super.dispose();
  }

  void _toggleCameraPower(bool value) async {
    setState(() {
      _isCameraPowerOn = value;
    });

    if (!_isCameraPowerOn) {
      // Matikan auto capture & controller hardware kamera
      _stopAutoCapture();

      if (_controller != null) {
        await _controller!.dispose();
        _controller = null;
      }
      if (mounted) setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('⚪ Kamera CCTV Dinonaktifkan (OFF) - Mode Hemat Daya'),
          duration: Duration(seconds: 2),
        ),
      );
    } else {
      // Nyalakan kembali kamera
      await _initCamera(_selectedCameraIdx);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🟢 Kamera CCTV Diaktifkan (ON) - Siap Memantau'),
            backgroundColor: Color(0xFF16A34A),
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
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

  void _startAutoCapture() {
    _autoTimer?.cancel();
    _autoTimer = null;
    _autoCaptureEnabled = true;
    _countdownSeconds = _autoIntervalSeconds;
    if (mounted) setState(() {});

    // Ambil foto perdana setelah kamera stabil
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted && _autoCaptureEnabled && !_isAnalyzing && _isCameraPowerOn) {
        _captureAndAnalyze();
      }
    });

    // Timer per detik untuk countdown dan penembakan snapshot otomatis
    _autoTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || !_autoCaptureEnabled || !_isCameraPowerOn) {
        timer.cancel();
        return;
      }

      if (_controller == null || !_controller!.value.isInitialized) return;

      if (_countdownSeconds > 1) {
        setState(() {
          _countdownSeconds--;
        });
      } else {
        setState(() {
          _countdownSeconds = _autoIntervalSeconds;
        });
        if (!_isAnalyzing) {
          _captureAndAnalyze();
        }
      }
    });
  }

  void _stopAutoCapture() {
    _autoTimer?.cancel();
    _autoTimer = null;
    if (mounted) {
      setState(() {
        _autoCaptureEnabled = false;
      });
    }
  }

  void _toggleAutoCapture(bool value) {
    if (value) {
      _startAutoCapture();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('🟢 Snapshot Otomatis Aktif: Mengambil foto setiap $_autoIntervalSeconds detik'),
          backgroundColor: const Color(0xFF16A34A),
          duration: const Duration(seconds: 2),
        ),
      );
    } else {
      _stopAutoCapture();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('⚪ Snapshot Otomatis Dijeda (Mode Manual)'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _captureAndAnalyze() async {
    if (_controller == null || !_controller!.value.isInitialized || _isAnalyzing || !_isCameraPowerOn) {
      return;
    }

    setState(() {
      _isAnalyzing = true;
    });

    try {
      final xfile = await _controller!.takePicture();
      final bytes = await xfile.readAsBytes();
      try {
        final f = File(xfile.path);
        if (f.existsSync()) f.deleteSync();
      } catch (_) {}

      final base64Image = base64Encode(bytes);

      final result = await ApiService.sendCctvFrame(base64Image);
      if (!mounted) return;

      setState(() {
        _latestResult = result;
        _isServerConnected = true;
      });

      if (result.alertSent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.alertMessage ?? 'Peringatan terkirim ke petugas kebersihan!'),
            backgroundColor: Colors.red.shade700,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error capture and analyze: $e');
      if (mounted && !_autoCaptureEnabled) {
        setState(() {
          _isServerConnected = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Gagal mengirim ke $_serverUrl: $e'),
            backgroundColor: Colors.redAccent,
            duration: const Duration(seconds: 4),
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
    // Mode Standby jika kamera dimatikan (OFF)
    if (!_isCameraPowerOn) {
      return Scaffold(
        backgroundColor: const Color(0xFF0B132B),
        body: SafeArea(
          child: Column(
            children: [
              // Top Bar Minimalis saat OFF
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Row(
                        children: const [
                          Icon(Icons.power_settings_new, color: Colors.redAccent, size: 14),
                          SizedBox(width: 6),
                          Text(
                            'KAMERA: OFF',
                            style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: _showQuickConnectionDialog,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: _isServerConnected == true
                              ? const Color(0xFF16A34A).withOpacity(0.9)
                              : const Color(0xFFD97706).withOpacity(0.9),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _isServerConnected == true ? Icons.cloud_done : Icons.cloud_off,
                              color: Colors.white,
                              size: 13,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _isServerConnected == true ? 'Terhubung' : 'Atur Server',
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // Tampilan Siaga / Standby
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.05),
                  border: Border.all(color: Colors.white12, width: 2),
                ),
                child: const Icon(
                  Icons.videocam_off_rounded,
                  color: Colors.white38,
                  size: 48,
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Kamera CCTV Dinonaktifkan (OFF)',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(height: 8),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 36),
                child: Text(
                  'Kamera HP dan pengiriman video dinonaktifkan untuk menghemat daya. Tekan tombol di bawah untuk mengaktifkan video CCTV secara langsung.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white60,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Tombol Nyalakan Kamera (ON)
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A),
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                  elevation: 6,
                ),
                onPressed: () => _toggleCameraPower(true),
                icon: const Icon(Icons.power_settings_new, color: Colors.white, size: 20),
                label: const Text(
                  'Nyalakan Kamera (ON)',
                  style: TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.bold),
                ),
              ),

              const Spacer(),
            ],
          ),
        ),
      );
    }

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
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. LIVE CAMERA FULL BLEED (Menyesuaikan Layar HP Tanpa Distorsi)
          LayoutBuilder(
            builder: (context, constraints) {
              return SizedBox(
                width: constraints.maxWidth,
                height: constraints.maxHeight,
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    width: _controller!.value.previewSize != null
                        ? _controller!.value.previewSize!.height
                        : constraints.maxWidth,
                    height: _controller!.value.previewSize != null
                        ? _controller!.value.previewSize!.width
                        : constraints.maxHeight,
                    child: CameraPreview(_controller!),
                  ),
                ),
              );
            },
          ),

          // 2. HUD RETICLE & HASIL ANALISIS DI ATAS
          CctvHudOverlay(
            latestResult: _latestResult,
            isAnalyzing: _isAnalyzing,
            autoCaptureEnabled: _autoCaptureEnabled,
            autoIntervalSeconds: _autoIntervalSeconds,
          ),

          // 3. HEADER ATAS TERPADU (Satu Baris Fleksibel, Anti-Bentrok & Anti-Overlap)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    // Badge Kiri: Live CCTV + Auto Snapshot Countdown
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.72),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _isServerConnected == true
                                ? const Color(0xFF16A34A)
                                : (_isServerConnected == false ? Colors.redAccent : Colors.white12),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: _autoCaptureEnabled ? Colors.greenAccent : Colors.orangeAccent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Flexible(
                              child: Text(
                                'ECO-SORT CCTV',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (_autoCaptureEnabled) ...[
                              const SizedBox(width: 5),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade900.withOpacity(0.7),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'AUTO ${_countdownSeconds}s',
                                  style: const TextStyle(
                                    color: Colors.greenAccent,
                                    fontSize: 9.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Badge Sakelar Kamera ON / OFF Cepat di Atas
                    InkWell(
                      onTap: () => _toggleCameraPower(!_isCameraPowerOn),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                        decoration: BoxDecoration(
                          color: _isCameraPowerOn ? const Color(0xFF16A34A).withOpacity(0.9) : Colors.black.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: _isCameraPowerOn ? Colors.greenAccent : Colors.white24,
                            width: 1,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(Icons.power_settings_new, color: Colors.white, size: 13),
                            SizedBox(width: 4),
                            Text(
                              'ON',
                              style: TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),

                    // Badge Kanan: Status Server (Tap to Quick Setup)
                    GestureDetector(
                      onTap: _showQuickConnectionDialog,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                        decoration: BoxDecoration(
                          color: _isServerConnected == true
                              ? const Color(0xFF16A34A).withOpacity(0.9)
                              : (_isServerConnected == false
                                  ? const Color(0xFFD97706).withOpacity(0.9)
                                  : Colors.black.withOpacity(0.7)),
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
                              size: 13,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _isServerConnected == true ? 'Terhubung' : 'Atur Server',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10.5,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),

                    // Tombol Pengaturan (Settings)
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.7),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white12),
                      ),
                      child: IconButton(
                        padding: EdgeInsets.zero,
                        icon: const Icon(Icons.settings, color: Colors.white, size: 18),
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
            ),
          ),

          // 4. DECK KONTROL BAWAH (Responsif, Proporsional, Tidak Pernah Melebihi Frame HP)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A).withOpacity(0.88),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withOpacity(0.12)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.4),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Baris 1: Kontrol Sekunder (Power ON/OFF, Auto Snapshot, Senter, Putar Kamera)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // Tombol Sakelar Power ON / OFF Kamera
                          InkWell(
                            onTap: () => _toggleCameraPower(false),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.red.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: Colors.redAccent.withOpacity(0.6)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: const [
                                  Icon(Icons.power_settings_new, color: Colors.redAccent, size: 15),
                                  SizedBox(width: 4),
                                  Text(
                                    'Matikan (OFF)',
                                    style: TextStyle(
                                      color: Colors.redAccent,
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          // Tombol Snapshot Otomatis (Auto Capture ON / OFF)
                          InkWell(
                            onTap: () => _toggleAutoCapture(!_autoCaptureEnabled),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: _autoCaptureEnabled
                                    ? const Color(0xFF16A34A).withOpacity(0.25)
                                    : Colors.white10,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: _autoCaptureEnabled
                                      ? const Color(0xFF22C55E)
                                      : Colors.white24,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    _autoCaptureEnabled ? Icons.timer : Icons.timer_off_outlined,
                                    color: _autoCaptureEnabled ? Colors.greenAccent : Colors.white70,
                                    size: 16,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    _autoCaptureEnabled ? 'Auto ${_countdownSeconds}s' : 'Auto Off',
                                    style: TextStyle(
                                      color: _autoCaptureEnabled ? Colors.greenAccent : Colors.white70,
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          // Senter (Torch)
                          InkWell(
                            onTap: _toggleTorch,
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                              decoration: BoxDecoration(
                                color: _isTorchOn ? Colors.yellow.withOpacity(0.2) : Colors.white10,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: _isTorchOn ? Colors.yellow : Colors.transparent),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    _isTorchOn ? Icons.flash_on : Icons.flash_off,
                                    color: _isTorchOn ? Colors.yellow : Colors.white70,
                                    size: 15,
                                  ),
                                  const SizedBox(width: 3),
                                  Text(
                                    'Senter',
                                    style: TextStyle(
                                      color: _isTorchOn ? Colors.yellow : Colors.white70,
                                      fontSize: 10.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          // Putar Kamera (Flip)
                          InkWell(
                            onTap: _flipCamera,
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.white10,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: const [
                                  Icon(Icons.flip_camera_ios, color: Colors.white70, size: 15),
                                  SizedBox(width: 3),
                                  Text('Putar', style: TextStyle(color: Colors.white70, fontSize: 10.5)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 10),

                      // Status Bar Countdown Snapshot Otomatis
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _autoCaptureEnabled
                              ? const Color(0xFF16A34A).withOpacity(0.18)
                              : Colors.white.withOpacity(0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _autoCaptureEnabled
                                ? const Color(0xFF22C55E).withOpacity(0.4)
                                : Colors.white12,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _autoCaptureEnabled
                                    ? const Color(0xFF22C55E)
                                    : Colors.white38,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _autoCaptureEnabled
                                  ? (_isAnalyzing
                                      ? '⚡ Mengirim & Menganalisis Frame CCTV...'
                                      : 'Snapshot otomatis berikutnya dalam $_countdownSeconds detik')
                                  : 'Mode Manual (Tekan tombol bulat di bawah untuk snapshot)',
                              style: TextStyle(
                                color: _autoCaptureEnabled ? Colors.greenAccent : Colors.white60,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 10),

                      // Baris 2: Tombol Shutter Manual
                      GestureDetector(
                        onTap: _isAnalyzing ? null : _captureAndAnalyze,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 62,
                              height: 62,
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 3),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF16A34A).withOpacity(0.4),
                                    blurRadius: 10,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _isAnalyzing
                                      ? const Color(0xFF15803D)
                                      : const Color(0xFF16A34A),
                                ),
                                child: Center(
                                  child: _isAnalyzing
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2.5,
                                          ),
                                        )
                                      : const Icon(
                                          Icons.camera_alt,
                                          color: Colors.white,
                                          size: 26,
                                        ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              _isAnalyzing ? 'Menganalisis dengan Gemini AI...' : 'Jepret Manual Sekarang',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
