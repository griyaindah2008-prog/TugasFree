/* ============================================================
   db.js — Lapisan penyimpanan IndexedDB.
   Database "tugas-app" berisi 3 object store:
   - tasks  : data tugas (keyPath "id"), checklist tertanam di objek
   - folders: data folder buatan sendiri (keyPath "id")
   - items  : isi folder — foto / file / catatan (keyPath "id",
              index "folderId" untuk ambil isi per folder)
   ============================================================ */
(function () {
  'use strict';

  var NAMA_DB = 'tugas-app';
  var VERSI_DB = 1;
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
