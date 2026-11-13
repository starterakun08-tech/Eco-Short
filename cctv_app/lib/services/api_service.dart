import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cctv_result.dart';

class ApiService {
  static const String _defaultServerUrl = 'http://192.168.109.46:40122'; // IP Server Dashboard EcoSort (Jaringan LAB RPL)
  static const String _defaultDeviceId = 'esp32-ecosort-1';
  static const String _defaultDeviceToken = 'eco_token_12345';

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('server_url') ?? _defaultServerUrl;
  }

  static Future<void> setServerUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server_url', url.trim());
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

  /// Kirim foto CCTV base64 ke endpoint /api/ai/analyze-cctv
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
      throw Exception('Server error ${response.statusCode}: ${response.body}');
    }
  }

  /// Ping koneksi server
  static Future<bool> pingServer() async {
    try {
      final baseUrl = await getServerUrl();
      final uri = Uri.parse('$baseUrl/api/ai/status');
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      return res.statusCode == 200 || res.statusCode == 401; // Reachable
    } catch (_) {
      return false;
    }
  }
}

