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
    await ApiService.setServerUrl(_serverUrlCtrl.text);
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

    await ApiService.setServerUrl(_serverUrlCtrl.text);
    final ok = await ApiService.pingServer();

    if (!mounted) return;
    setState(() {
      _isTestingPing = false;
      _pingSuccess = ok;
      _pingMessage = ok
          ? 'Koneksi ke Server EcoSort Berhasil!'
          : 'Gagal terhubung ke Server. Pastikan IP dan Port benar.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text('Pengaturan Kamera CCTV'),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Kartu Konfigurasi Server
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(16),
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
                    const SizedBox(height: 14),
                    TextField(
                      controller: _serverUrlCtrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Alamat URL Server EcoSort',
                        labelStyle: TextStyle(color: Colors.white70),
                        hintText: 'http://192.168.1.100:40122',
                        hintStyle: TextStyle(color: Colors.white30),
                        prefixIcon: Icon(Icons.dns, color: Colors.greenAccent),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Pilihan Cepat Alamat Server:',
                      style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        ActionChip(
                          backgroundColor: Colors.white12,
                          label: const Text('IP Laptop (192.168.100.16:40122)', style: TextStyle(color: Colors.white, fontSize: 11)),
                          onPressed: () {
                            setState(() {
                              _serverUrlCtrl.text = 'http://192.168.100.16:40122';
                            });
                          },
                        ),
                        ActionChip(
                          backgroundColor: Colors.white12,
                          label: const Text('Emulator (10.0.2.2:40122)', style: TextStyle(color: Colors.white, fontSize: 11)),
                          onPressed: () {
                            setState(() {
                              _serverUrlCtrl.text = 'http://10.0.2.2:40122';
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Tips: Jika menggunakan HP fisik, pastikan HP dan laptop terhubung ke WiFi yang sama.',
                      style: TextStyle(color: Colors.white54, fontSize: 11),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF334155),
                        foregroundColor: Colors.white,
                      ),
                      onPressed: _isTestingPing ? null : _testPing,
                      icon: _isTestingPing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.wifi_tethering, size: 18),
                      label: const Text('Tes Koneksi ke Server'),
                    ),
                    if (_pingMessage != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _pingSuccess == true ? Colors.green.shade900 : Colors.red.shade900,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _pingMessage!,
                          style: const TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Kartu ID Perangkat & Token
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(16),
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
                    const SizedBox(height: 14),
                    TextField(
                      controller: _deviceIdCtrl,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'ID Perangkat Target',
                        labelStyle: TextStyle(color: Colors.white70),
                        hintText: 'esp32-ecosort-1',
                        prefixIcon: Icon(Icons.memory, color: Colors.greenAccent),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _deviceTokenCtrl,
                      style: const TextStyle(color: Colors.white),
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Token Autentikasi (DEVICE_TOKEN)',
                        labelStyle: TextStyle(color: Colors.white70),
                        hintText: 'eco_token_12345',
                        prefixIcon: Icon(Icons.key, color: Colors.greenAccent),
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Kartu Pengaturan Auto-Capture Interval
            Card(
              color: const Color(0xFF1E293B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(16),
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
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Interval Otomatis:', style: TextStyle(color: Colors.white70)),
                        Text(
                          '${_intervalVal.toInt()} Detik',
                          style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold),
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

            const SizedBox(height: 24),

            // Tombol Simpan
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: _saveSettings,
                child: const Text('Simpan Pengaturan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

