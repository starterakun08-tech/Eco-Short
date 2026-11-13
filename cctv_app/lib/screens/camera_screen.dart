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
  bool _isCameraPowerOn = true;
  bool _isLiveStreaming = false;
  Timer? _liveStreamTimer;
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
    final ok = await ApiService.pingServer(url);
    if (!mounted) return;
    setState(() {
      _autoIntervalSeconds = interval;
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
                    hintText: 'http://144.79.202.196:40122',
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
                      avatar: const Icon(Icons.cloud_queue, size: 14, color: Colors.white),
                      label: const Text('Cloud VPS (144.79.202.196:40122)', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      onPressed: () {
                        setDialogState(() {
                          ctrl.text = ApiService.vpsServerUrl;
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
    _liveStreamTimer?.cancel();
    _autoTimer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  void _toggleCameraPower(bool value) async {
    setState(() {
      _isCameraPowerOn = value;
    });

    if (!_isCameraPowerOn) {
      // Matikan streaming video & auto capture
      _liveStreamTimer?.cancel();
      _liveStreamTimer = null;
      _autoTimer?.cancel();
      _isLiveStreaming = false;
      _autoCaptureEnabled = false;

      // Matikan controller hardware kamera
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

  void _toggleLiveStream(bool value) {
    if (!_isCameraPowerOn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Nyalakan kamera (ON) terlebih dahulu untuk mengaktifkan Video CCTV.'),
          backgroundColor: Color(0xFFD97706),
        ),
      );
      return;
    }

    setState(() {
      _isLiveStreaming = value;
    });

    _liveStreamTimer?.cancel();
    if (_isLiveStreaming) {
      // Ambil frame pertama
      _captureAndAnalyze();
      // Streaming loop real-time setiap 1.5 detik
      _liveStreamTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
        if (!_isAnalyzing && _isCameraPowerOn && _controller != null && _controller!.value.isInitialized) {
          _captureAndAnalyze();
        }
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('🔴 Video CCTV Real-Time Aktif: Mengirim live stream ke Web Dashboard!'),
          backgroundColor: Colors.red.shade700,
          duration: const Duration(seconds: 3),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Live Video CCTV dinonaktifkan'),
          duration: Duration(seconds: 1),
        ),
      );
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

  void _toggleAutoCapture(bool value) {
    setState(() {
      _autoCaptureEnabled = value;
    });

    _autoTimer?.cancel();
    if (_autoCaptureEnabled) {
      _captureAndAnalyze();
      _autoTimer = Timer.periodic(
        Duration(seconds: _autoIntervalSeconds),
        (_) => _captureAndAnalyze(),
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Auto-Capture aktif: Mengambil foto setiap $_autoIntervalSeconds detik'),
          backgroundColor: Colors.green.shade700,
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
                    // Badge Kiri: Live CCTV + Video/Auto status
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.72),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: _isLiveStreaming ? Colors.redAccent : Colors.greenAccent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                _isLiveStreaming ? 'LIVE VIDEO CCTV' : 'ECO-SORT CCTV',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.5,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (_autoCaptureEnabled && !_isLiveStreaming) ...[
                              const SizedBox(width: 5),
                              Text(
                                '• AUTO ${_autoIntervalSeconds}s',
                                style: const TextStyle(
                                  color: Colors.greenAccent,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.bold,
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
                      // Baris 1: Kontrol Sekunder (Power ON/OFF, Live Video CCTV, Senter, Putar Kamera)
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

                          // Tombol Video CCTV Real-Time (Live Streaming)
                          InkWell(
                            onTap: () => _toggleLiveStream(!_isLiveStreaming),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: _isLiveStreaming
                                    ? Colors.red.withOpacity(0.3)
                                    : Colors.white10,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: _isLiveStreaming ? Colors.redAccent : Colors.transparent,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    _isLiveStreaming ? Icons.videocam : Icons.videocam_outlined,
                                    color: _isLiveStreaming ? Colors.redAccent : Colors.white70,
                                    size: 16,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    _isLiveStreaming ? 'Video Live' : 'Video Off',
                                    style: TextStyle(
                                      color: _isLiveStreaming ? Colors.redAccent : Colors.white70,
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

                      const SizedBox(height: 12),

                      // Baris 2: Tombol Shutter / Identifikasi Pelanggar AI
                      GestureDetector(
                        onTap: _isAnalyzing
                            ? null
                            : (_isLiveStreaming ? () => _toggleLiveStream(false) : _captureAndAnalyze),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 3),
                                boxShadow: [
                                  BoxShadow(
                                    color: (_isLiveStreaming ? Colors.redAccent : const Color(0xFF16A34A)).withOpacity(0.4),
                                    blurRadius: 10,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _isLiveStreaming
                                      ? const Color(0xFFDC2626)
                                      : (_isAnalyzing ? const Color(0xFF15803D) : const Color(0xFF16A34A)),
                                ),
                                child: Center(
                                  child: _isAnalyzing
                                      ? const SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2.5,
                                          ),
                                        )
                                      : Icon(
                                          _isLiveStreaming ? Icons.stop_rounded : Icons.camera_alt,
                                          color: Colors.white,
                                          size: 28,
                                        ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _isLiveStreaming
                                  ? '🔴 Video CCTV Streaming Real-Time (Ketuk Berhenti)'
                                  : (_isAnalyzing ? 'Menganalisis dengan AI Gemini...' : 'Ambil Snapshot & Identifikasi Pelanggar AI'),
                              style: TextStyle(
                                color: _isLiveStreaming ? Colors.redAccent : Colors.white70,
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
