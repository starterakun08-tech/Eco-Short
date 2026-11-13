import 'package:flutter/material.dart';
import '../services/api_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({Key? key}) : super(key: key);

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _serverUrlCtrl = TextEditingController();
  final _deviceIdCtrl = TextEditingController();
  final _deviceTokenCtrl = TextEditingController();
  double _intervalVal = 10;
  bool _isTestingPing = false;
  String? _pingMessage;
  bool? _pingSuccess;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    _serverUrlCtrl.text = await ApiService.getServerUrl();
    _deviceIdCtrl.text = await ApiService.getDeviceId();
    _deviceTokenCtrl.text = await ApiService.getDeviceToken();
    final interval = await ApiService.getAutoCaptureInterval();
    setState(() {
      _intervalVal = interval.toDouble();
    });
  }

  Future<void> _saveSettings() async {
    final cleanUrl = ApiService.normalizeUrl(_serverUrlCtrl.text);
    await ApiService.setServerUrl(cleanUrl);
    await ApiService.setDeviceId(_deviceIdCtrl.text);
    await ApiService.setDeviceToken(_deviceTokenCtrl.text);
    await ApiService.setAutoCaptureInterval(_intervalVal.toInt());

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Pengaturan CCTV berhasil disimpan'),
        backgroundColor: Colors.green,
      ),
    );
    Navigator.pop(context);
  }

  Future<void> _testPing() async {
    setState(() {
      _isTestingPing = true;
      _pingMessage = null;
      _pingSuccess = null;
    });

    final testUrl = ApiService.normalizeUrl(_serverUrlCtrl.text);
    final ok = await ApiService.pingServer(testUrl);

    if (!mounted) return;
    setState(() {
      _isTestingPing = false;
      _pingSuccess = ok;
      _pingMessage = ok
          ? 'Koneksi ke Server EcoSort Berhasil!'
          : 'Gagal terhubung. Pastikan server aktif dan URL benar.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text('Pengaturan Kamera CCTV', style: TextStyle(fontSize: 16)),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Kartu Konfigurasi Server
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'KONEKSI SERVER ECOSORT',
                      style: TextStyle(
                        color: Colors.greenAccent,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _serverUrlCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'Alamat URL Server EcoSort',
                        labelStyle: TextStyle(color: Colors.white70, fontSize: 12),
                        hintText: 'http://144.79.202.196:40122',
                        hintStyle: TextStyle(color: Colors.white30, fontSize: 12),
                        prefixIcon: Icon(Icons.dns, color: Colors.greenAccent, size: 20),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Pilihan Cepat Server:',
                      style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ActionChip(
                          backgroundColor: const Color(0xFF16A34A),
                          avatar: const Icon(Icons.cloud_queue, size: 14, color: Colors.white),
                          label: const Text('Cloud VPS (144.79.202.196)', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                          onPressed: () {
                            setState(() {
                              _serverUrlCtrl.text = ApiService.vpsServerUrl;
                            });
                          },
                        ),
                        ActionChip(
                          backgroundColor: Colors.white12,
                          avatar: const Icon(Icons.computer, size: 14, color: Colors.white70),
                          label: const Text('Laptop LAB RPL (192.168.109.46)', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          onPressed: () {
                            setState(() {
                              _serverUrlCtrl.text = ApiService.localServerUrl;
                            });
                          },
                        ),
                        ActionChip(
                          backgroundColor: Colors.white12,
                          avatar: const Icon(Icons.phone_android, size: 14, color: Colors.white70),
                          label: const Text('Emulator (10.0.2.2:40122)', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          onPressed: () {
                            setState(() {
                              _serverUrlCtrl.text = 'http://10.0.2.2:40122';
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF334155),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      ),
                      onPressed: _isTestingPing ? null : _testPing,
                      icon: _isTestingPing
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.wifi_tethering, size: 16),
                      label: const Text('Tes Koneksi ke Server', style: TextStyle(fontSize: 12)),
                    ),
                    if (_pingMessage != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _pingSuccess == true ? Colors.green.shade900 : Colors.red.shade900,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _pingMessage!,
                          style: const TextStyle(color: Colors.white, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 14),

            // Kartu ID Perangkat & Token
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'IDENTITAS CCTV & TOKEN',
                      style: TextStyle(
                        color: Colors.greenAccent,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _deviceIdCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'ID Perangkat Target',
                        labelStyle: TextStyle(color: Colors.white70, fontSize: 12),
                        hintText: 'esp32-ecosort-1',
                        prefixIcon: Icon(Icons.memory, color: Colors.greenAccent, size: 20),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _deviceTokenCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Token Autentikasi (DEVICE_TOKEN)',
                        labelStyle: TextStyle(color: Colors.white70, fontSize: 12),
                        hintText: 'eco_token_12345',
                        prefixIcon: Icon(Icons.key, color: Colors.greenAccent, size: 20),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 14),

            // Kartu Pengaturan Auto-Capture Interval
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'JEDA AUTO-CAPTURE (DETIK)',
                      style: TextStyle(
                        color: Colors.greenAccent,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Interval Otomatis:', style: TextStyle(color: Colors.white70, fontSize: 12)),
                        Text(
                          '${_intervalVal.toInt()} Detik',
                          style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ],
                    ),
                    Slider(
                      value: _intervalVal,
                      min: 5,
                      max: 60,
                      divisions: 11,
                      activeColor: Colors.green,
                      inactiveColor: Colors.white24,
                      onChanged: (val) {
                        setState(() {
                          _intervalVal = val;
                        });
                      },
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Tombol Simpan
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: _saveSettings,
                child: const Text('Simpan Pengaturan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
