import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/camera_screen.dart';

List<CameraDescription> cameras = [];

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  try {
    cameras = await availableCameras();
  } catch (e) {
    debugPrint('Error fetch cameras: $e');
  }

  runApp(const EcoSortCctvApp());
}

class EcoSortCctvApp extends StatelessWidget {
  const EcoSortCctvApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EcoSort CCTV',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF16A34A),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF16A34A),
          secondary: Color(0xFF22C55E),
          surface: Color(0xFF1E293B),
        ),
      ),
      home: CameraScreen(cameras: cameras),
    );
  }
}

