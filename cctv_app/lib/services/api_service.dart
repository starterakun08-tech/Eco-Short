import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cctv_result.dart';

class ApiService {
  // Preset URL Server
  static const String vpsServerUrl = 'https://nexahome.app.hostingin.net';  // Server Cloud VPS NexaHome (HTTPS Otomatis)
  static const String ipServerUrl = 'http://144.79.202.196:40122';         // Alternatif IP Langsung Port 40122
  static const String localServerUrl = 'http://192.168.109.46:40122';      // Server Lokal Laptop (Jaringan LAB RPL / Hotspot)
  static const String _defaultDeviceId = 'esp32-ecosort-1';
  static const String _defaultDeviceToken = 'eco_token_12345';

  static String normalizeUrl(String input) {
    String url = input.trim();
    if (url.isEmpty) return vpsServerUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://$url';
    }
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('server_url');
    if (saved != null && saved.trim().isNotEmpty) {
      return normalizeUrl(saved);
    }
    return vpsServerUrl;
  }

  static Future<void> setServerUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    final clean = normalizeUrl(url);
    await prefs.setString('server_url', clean);
  }

  static Future<String> getDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('device_id') ?? _defaultDeviceId;
  }

  static Future<void> setDeviceId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('device_id', id.trim());
  }

  static Future<String> getDeviceToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('device_token') ?? _defaultDeviceToken;
  }

  static Future<void> setDeviceToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('device_token', token.trim());
  }

  static Future<int> getAutoCaptureInterval() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt('auto_interval') ?? 10;
  }

  static Future<void> setAutoCaptureInterval(int sec) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('auto_interval', sec);
  }

  /// Kirim snapshot CCTV base64 ke endpoint /api/ai/analyze-cctv
  static Future<CctvAnalysisResult> sendCctvFrame(String base64Image) async {
    final baseUrl = await getServerUrl();
    final deviceId = await getDeviceId();
    final deviceToken = await getDeviceToken();

    final uri = Uri.parse('$baseUrl/api/ai/analyze-cctv');

    final body = jsonEncode({
      'image': base64Image.startsWith('data:')
          ? base64Image
          : 'data:image/jpeg;base64,$base64Image',
      'deviceId': deviceId,
      'deviceToken': deviceToken,
      'source': 'cctv_flutter_app',
    });

    final response = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'x-device-token': deviceToken,
          },
          body: body,
        )
        .timeout(const Duration(seconds: 15));

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final data = jsonDecode(response.body);
      return CctvAnalysisResult.fromJson(data);
    } else {
      throw Exception('Server ${response.statusCode}: ${response.body}');
    }
  }

  /// Ping koneksi server (cek apakah URL aktif dan bisa dijangkau)
  static Future<bool> pingServer([String? testUrl]) async {
    try {
      final baseUrl = testUrl != null ? normalizeUrl(testUrl) : await getServerUrl();
      final uri = Uri.parse('$baseUrl/api/ai/status');
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      return res.statusCode == 200 || res.statusCode == 401;
    } catch (_) {
      return false;
    }
  }
}
