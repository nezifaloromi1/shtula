import 'dart:convert';
import 'dart:io';

import 'package:sembast/sembast.dart';
import 'package:sembast/sembast_io.dart';

const storeNames = <String>['podcast', 'episode', 'queue', 'transcript'];

Future<List<Map<String, Object?>>> readStore(Database database, String name) async {
  final store = intMapStoreFactory.store(name);
  final records = await store.find(database);
  return records
      .map((record) => <String, Object?>{'key': record.key, 'value': record.value})
      .toList(growable: false);
}

Future<void> main(List<String> args) async {
  if (args.length < 1 || args.length > 2) {
    stderr.writeln(
      'Usage: dart run bin/export_legacy_database.dart <path-to-anytime.db> [output.json]',
    );
    exitCode = 64;
    return;
  }

  final input = File(args[0]);
  if (!await input.exists()) {
    stderr.writeln('Database file does not exist: ${input.path}');
    exitCode = 66;
    return;
  }

  final output = File(args.length == 2 ? args[1] : 'sheademtula-legacy-export.json');
  Database? database;
  try {
    // The source DB is deliberately opened read-only: export must never mutate
    // or compact the user's original Flutter database.
    database = await databaseFactoryIo.openDatabase(
      input.absolute.path,
      mode: DatabaseMode.readOnly,
    );

    final stores = <String, List<Map<String, Object?>>>{};
    for (final name in storeNames) {
      stores[name] = await readStore(database, name);
    }

    final export = <String, Object?>{
      'format': 'sheademtula-legacy-export',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'source': <String, Object?>{
        'databaseFile': input.uri.pathSegments.isEmpty
            ? 'anytime.db'
            : input.uri.pathSegments.last,
        'databaseVersion': 3,
        'readOnly': true,
      },
      'stores': stores,
      'preferences': <String, Object?>{},
      'notes': <String>[
        'The database export does not include SharedPreferences. The mobile app attempts a native read of FlutterSharedPreferences/UserDefaults when the existing app data is upgraded in place.',
        'Only the built-in Sheikh Aadam Tuulaa collection is restored as a remote collection. Other-feed episode metadata is not resubscribed.',
        'Downloaded audio files are copied separately from the old application files directory by the mobile app migration.',
      ],
    };

    await output.parent.create(recursive: true);
    await output.writeAsString(
      const JsonEncoder.withIndent('  ').convert(export),
      flush: true,
    );
    stdout.writeln('Exported Sembast stores to ${output.absolute.path}');
    for (final entry in stores.entries) {
      stdout.writeln('  ${entry.key}: ${entry.value.length} records');
    }
  } catch (error, stackTrace) {
    stderr.writeln('Could not export the legacy database: $error');
    stderr.writeln(stackTrace);
    exitCode = 1;
  } finally {
    await database?.close();
  }
}
