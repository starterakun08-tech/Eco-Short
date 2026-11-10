class CctvAnalysisResult {
  final int detectedTrashCount;
  final String status;
  final String statusColor; // 'green', 'yellow', 'red'
  final String summary;
  final List<String> trashItems;
  final String radiusNote;
  final bool alertSent;
  final String? alertMessage;
  final DateTime analyzedAt;

  CctvAnalysisResult({
    required this.detectedTrashCount,
    required this.status,
    required this.statusColor,
    required this.summary,
    required this.trashItems,
    required this.radiusNote,
    required this.alertSent,
    this.alertMessage,
    required this.analyzedAt,
  });

  factory CctvAnalysisResult.fromJson(Map<String, dynamic> json) {
    return CctvAnalysisResult(
      detectedTrashCount: json['detectedTrashCount'] is int
          ? json['detectedTrashCount']
          : int.tryParse(json['detectedTrashCount']?.toString() ?? '0') ?? 0,
      status: json['status']?.toString() ?? 'Bersih',
      statusColor: json['statusColor']?.toString() ?? 'green',
      summary: json['summary']?.toString() ?? 'Area sekitar tong sampah bersih.',
      trashItems: (json['trashItems'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      radiusNote: json['radiusNote']?.toString() ??
          'Radius 2 meter dari tong sampah diperiksa',
      alertSent: json['alertSent'] == true,
      alertMessage: json['alertMessage']?.toString(),
      analyzedAt: json['analyzedAt'] != null
          ? DateTime.tryParse(json['analyzedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'detectedTrashCount': detectedTrashCount,
      'status': status,
      'statusColor': statusColor,
      'summary': summary,
      'trashItems': trashItems,
      'radiusNote': radiusNote,
      'alertSent': alertSent,
      'alertMessage': alertMessage,
      'analyzedAt': analyzedAt.toIso8601String(),
    };
  }
}

