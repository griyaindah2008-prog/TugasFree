/* ============================================================
   db.js — Lapisan penyimpanan IndexedDB.
   Database "tugas-app" berisi 5 object store:
   - tasks      : data tugas (keyPath "id"), checklist tertanam di objek
   - folders    : folder bertingkat (keyPath "id", field "parentId"
                  menunjuk ke folder induknya)
   - items      : isi folder — foto / file / catatan (keyPath "id",
                  index "folderId" untuk ambil isi per folder) dan
                  foto milik tugas (index "taskId")
   - pengaturan : pengaturan aplikasi per-kunci (keyPath "kunci"),
                  dipakai untuk foto utama di halaman depan (mis.
                  jadwal pelajaran) — kunci "foto-utama"
   - notes      : catatan lepas milik tab Catatan (keyPath "id") —
                  judul, isi, pinned (disematkan di atas), createdAt
   ============================================================ */
(function () {
  'use strict';

  var NAMA_DB = 'tugas-app';
  var VERSI_DB = 4;
  var dbJanji = null;

  function bukaDB() {
    if (dbJanji) return dbJanji;
    dbJanji = new Promise(function (selesai, gagal) {
      var req = indexedDB.open(NAMA_DB, VERSI_DB);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('items')) {
          var items = db.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('folderId', 'folderId', { unique: false });
          items.createIndex('taskId', 'taskId', { unique: false });
        } else if (req.transaction) {
          /* database lama (v1): tambahkan index taskId untuk foto tugas */
          var os = req.transaction.objectStore('items');
          if (!os.indexNames.contains('folderId')) {
            os.createIndex('folderId', 'folderId', { unique: false });
          }
          if (!os.indexNames.contains('taskId')) {
            os.createIndex('taskId', 'taskId', { unique: false });
          }
        }
        /* v3: pengaturan aplikasi (foto utama halaman depan) */
        if (!db.objectStoreNames.contains('pengaturan')) {
          db.createObjectStore('pengaturan', { keyPath: 'kunci' });
        }
        /* v4: catatan lepas milik tab Catatan (judul + isi + pin + tanggal dibuat) */
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { selesai(req.result); };
      req.onerror = function () { gagal(req.error); };
      req.onblocked = function () { gagal(new Error('Database diblokir tab lain.')); };
    });
    return dbJanji;
  }

  /* Bungkus request IndexedDB jadi Promise */
  function janjikan(req) {
    return new Promise(function (selesai, gagal) {
      req.onsuccess = function () { selesai(req.result); };
      req.onerror = function () { gagal(req.error); };
    });
  }

  function jalankan(store, mode, aksi) {
    return bukaDB().then(function (db) {
      return janjikan(aksi(db.transaction(store, mode).objectStore(store)));
    });
  }

  /* Simpan banyak objek dalam satu transaksi (dipakai saat import) */
  function simpanBanyak(store, daftar) {
    return bukaDB().then(function (db) {
      return new Promise(function (selesai, gagal) {
        var tx = db.transaction(store, 'readwrite');
        var os = tx.objectStore(store);
        daftar.forEach(function (o) { os.put(o); });
        tx.oncomplete = function () { selesai(); };
        tx.onerror = function () { gagal(tx.error); };
        tx.onabort = function () { gagal(tx.error || new Error('Transaksi dibatalkan')); };
      });
    });
  }

  /* API global */
  window.DB = {
    buka: bukaDB,
    /* ambil semua record */
    semua: function (store) {
      return jalankan(store, 'readonly', function (s) { return s.getAll(); });
    },
    /* ambil satu record berdasarkan id */
    ambil: function (store, id) {
      return jalankan(store, 'readonly', function (s) { return s.get(id); });
    },
    /* simpan (tambah atau perbarui) */
    simpan: function (store, obj) {
      return jalankan(store, 'readwrite', function (s) { return s.put(obj); });
    },
    hapus: function (store, id) {
      return jalankan(store, 'readwrite', function (s) { return s.delete(id); });
    },
    kosongkan: function (store) {
      return jalankan(store, 'readwrite', function (s) { return s.clear(); });
    },
    /* semua item milik satu folder (via index) */
    berdasarkanFolder: function (store, idFolder) {
      return jalankan(store, 'readonly', function (s) {
        return s.index('folderId').getAll(idFolder);
      });
    },
    /* hitung jumlah item milik satu folder */
    hitungFolder: function (store, idFolder) {
      return jalankan(store, 'readonly', function (s) {
        return s.index('folderId').count(idFolder);
      });
    },
    /* semua foto milik satu tugas (via index taskId) */
    berdasarkanTugas: function (store, idTugas) {
      return jalankan(store, 'readonly', function (s) {
        return s.index('taskId').getAll(idTugas);
      });
    },
    simpanBanyak: simpanBanyak
  };

  /* ID unik (fallback kalau crypto.randomUUID tidak tersedia,
     mis. saat dibuka lewat file:// tanpa secure context) */
  window.uid = function () {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* lanjut ke fallback */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };
})();
